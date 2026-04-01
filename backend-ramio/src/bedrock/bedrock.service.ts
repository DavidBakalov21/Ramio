import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { AssignmentLanguage } from '@prisma/client';

export type TestLanguage = 'python' | 'javascript' | 'java' | 'csharp';

interface InvokeResponseBody {
  content?: Array<{ text: string }>;
}

function stripMarkdownCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:\w+)?\s*\n?([\s\S]*?)\n?```$/);
  return match ? match[1].trim() : trimmed;
}

function toInferenceProfileId(modelId: string, region: string): string {
  if (
    modelId.startsWith('us.') ||
    modelId.startsWith('eu.') ||
    modelId.startsWith('apac.')
  ) {
    return modelId;
  }
  const prefix = region.startsWith('eu')
    ? 'eu.'
    : region.startsWith('us')
      ? 'us.'
      : region.startsWith('ap')
        ? 'apac.'
        : 'us.';
  return `${prefix}${modelId}`;
}

@Injectable()
export class BedrockService {
  private readonly modelId: string;

  constructor(
    @Inject('BedrockRuntimeClient')
    private readonly client: BedrockRuntimeClient,
    private readonly config: ConfigService,
  ) {
    const rawModelId =
      this.config.get<string>('BEDROCK_MODEL_ID') ??
      'anthropic.claude-haiku-4-5-20251001-v1:0';
    const region = this.config.get<string>('BEDROCK_REGION') ?? 'eu-north-1';
    this.modelId = toInferenceProfileId(rawModelId, region);
  }

  async invoke(prompt: string, maxTokens = 4096): Promise<string> {
    const payload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens,
      temperature: 0.2,
      messages: [
        {
          role: 'user' as const,
          content: [{ type: 'text' as const, text: prompt }],
        },
      ],
    };

    const command = new InvokeModelCommand({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload),
    });

    const response = await this.client.send(command);
    const decoded = new TextDecoder().decode(response.body);
    const body = JSON.parse(decoded) as InvokeResponseBody;
    return body.content?.[0]?.text ?? '';
  }

  /**
   * Multi-turn chat with a fixed system prompt (Claude on Bedrock Messages API).
   */
  async chatWithSystem(
    system: string,
    messages: { role: 'user' | 'assistant'; content: string }[],
    maxTokens = 4096,
  ): Promise<string> {
    if (!messages.length) {
      throw new Error('messages must not be empty');
    }
    const payload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens,
      temperature: 0.35,
      system,
      messages: messages.map((m) => ({
        role: m.role,
        content: [{ type: 'text' as const, text: m.content }],
      })),
    };

    const command = new InvokeModelCommand({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload),
    });

    const response = await this.client.send(command);
    const decoded = new TextDecoder().decode(response.body);
    const body = JSON.parse(decoded) as InvokeResponseBody;
    return body.content?.[0]?.text ?? '';
  }

  async generateSubmissionFeedback(input: {
    language: AssignmentLanguage;
    assignmentTitle: string;
    assignmentDescription?: string | null;
    maxPoints: number;
    code: string;
  }): Promise<{ feedback: string; suggestedPoints?: number }> {
    const languageLabelByAssignment: Record<AssignmentLanguage, string> = {
      PYTHON: 'Python',
      NODE_JS: 'JavaScript / Node.js',
      JAVA: 'Java',
      DOTNET: 'C# / .NET',
    };
    const languageLabel = languageLabelByAssignment[input.language];

    const prompt = `You are an experienced programming teacher reviewing a student's solution.

Your task is to provide feedback FOR THE TEACHER, not for the student directly.

Please:
- Briefly summarize what the student's code does and how close it is to the expected solution.
- List concrete strengths of the solution (correctness, style, structure, tests passing, etc.).
- List concrete weaknesses, mistakes, or misconceptions you see.
- Suggest how the teacher could explain these issues or coach the student in the next lesson.
- Optionally suggest a numeric score from 0 to ${input.maxPoints}.

IMPORTANT:
- Do NOT address the student directly (no "you should...").
- Speak about "the student" and "the solution".

Return your answer in this exact format:

FeedbackForTeacher:
<your analysis and teaching suggestions in plain text>

SuggestedPoints:
<integer between 0 and ${input.maxPoints}, or leave empty if you cannot decide>

---
Assignment:
Title: ${input.assignmentTitle}
Description: ${input.assignmentDescription ?? '(no description)'}
Language: ${languageLabel}
Max points: ${input.maxPoints}

Student code:
"""${languageLabel}
${input.code}
"""`;

    const raw = await this.invoke(prompt, 2048);
    const text = stripMarkdownCodeFences(raw);

    const pointsMatch = text.match(/SuggestedPoints:\s*([0-9]+)/i);
    const suggestedPoints = pointsMatch ? Number(pointsMatch[1]) : undefined;
    const feedbackMatch = text.match(
      /FeedbackForTeacher:\s*([\s\S]*?)(?:SuggestedPoints:|$)/i,
    );
    const feedback = (feedbackMatch ? feedbackMatch[1] : text).trim();

    return {
      feedback,
      suggestedPoints:
        typeof suggestedPoints === 'number' && !Number.isNaN(suggestedPoints)
          ? suggestedPoints
          : undefined,
    };
  }

  async generateUnitTests(
    sourceCode: string,
    language: TestLanguage = 'python',
  ): Promise<string> {
    const frameworkByLanguage: Record<TestLanguage, string> = {
      python: 'Python unittest',
      javascript: 'JavaScript/Node.js with Jest',
      java: 'Java tests without external dependencies (plain java/javac)',
      csharp: 'C#/.NET tests without external dependencies',
    };
    const framework = frameworkByLanguage[language];

    const prompt = `You are a senior developer. Generate unit tests for the following source code.

Requirements:
- Use ${framework}.
- Output ONLY the test code, no explanations or markdown code fences.
- Tests should be meaningful: cover main behaviors, edge cases, and important branches.
- Keep the test file self-contained and runnable.

Source code (${language}):

\`\`\`${language}
${sourceCode}
\`\`\`

Generate the complete test file now:`;

    const raw = await this.invoke(prompt, 8192);
    return stripMarkdownCodeFences(raw);
  }
  async generateUnitTestsFromDescription(
    description: string,
    language: TestLanguage = 'python',
  ): Promise<string> {
    const frameworkByLanguage: Record<TestLanguage, string> = {
      python: 'Python unittest',
      javascript: 'JavaScript/Node.js with Jest',
      java: 'Java tests without external dependencies (plain java/javac)',
      csharp: 'C#/.NET tests without external dependencies',
    };
    const framework = frameworkByLanguage[language];

    const prompt = `You are a senior developer. Generate unit tests based on the following assignment description.

Requirements:
- Use ${framework}.
- Output ONLY the test code, no explanations or markdown code fences.
- Tests should match what the description asks students to implement: assert the expected behavior.
- Keep the test file self-contained and runnable (imports, test runner).
- Assume the student will implement a solution that your tests will run against (e.g. solution.py or a module they provide).

Assignment description:

"""
${description}
"""

Generate the complete test file now:`;

    const raw = await this.invoke(prompt, 8192);
    return stripMarkdownCodeFences(raw);
  }
}
