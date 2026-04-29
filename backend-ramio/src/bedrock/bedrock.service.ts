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

Tone and scoring (learning context — keep facts, soften judgment):
- This is coursework, not a production security audit. Be fair and proportionate.
- If the brief is simple and the solution clearly satisfies it (especially if behavior is correct), suggested points should reflect that: do not suggest middling scores (e.g. 60–80) just because the code is minimal or not "elegant."
- Small issues (naming, formatting, minor style, slightly messy structure) are worth mentioning briefly as improvements, framed as normal for the level — not as reasons to slash the grade.
- Reserve clearly lower suggested scores for substantive gaps: wrong behavior, missing requirements, serious misunderstandings, or many failing tests if tests are relevant.
- When something is imperfect but acceptable for the assignment, say so explicitly (e.g. that it is a minor nit or acceptable at this stage).

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

  async generateProjectArchiveFeedback(input: {
    projectTitle: string;
    projectDescription?: string | null;
    assessmentPrompt?: string | null;
    maxPoints: number;
    projectFilesXml: string;
    automatedTestSummary?: {
      buildStatus: string | null;
      passed: number | null;
      failed: number | null;
      skipped: number | null;
    } | null;
  }): Promise<{ feedback: string; suggestedPoints?: number }> {
    const testBlock = (() => {
      const s = input.automatedTestSummary;
      if (!s) {
        return `Automated tests (CodeBuild):
No teacher-triggered CodeBuild run is recorded for this submission yet (or it was never started). Base functional judgment mainly on the extracted source files; do not assume automated tests passed.`;
      }
      const parts = [
        `Last recorded CodeBuild status: ${s.buildStatus ?? 'unknown'}`,
      ];
      const hasCounts =
        s.passed != null || s.failed != null || s.skipped != null;
      if (hasCounts) {
        parts.push(
          `Parsed test counts from build logs: passed=${s.passed ?? 'unknown'}, failed=${s.failed ?? 'unknown'}, skipped=${s.skipped ?? 'unknown'}`,
        );
        parts.push(
          'Use these counts together with the source: strong pass rates support a higher suggested score when the work matches the assignment; many failures warrant a lower score and specific gaps — but stay proportionate for a classroom (do not punish minor polish issues). If passed is high but the code looks weak, mention that tests may be shallow or incomplete.',
        );
      } else {
        parts.push(
          'Test pass/fail/skip counts were not parsed from the build logs (build may still be running, logs unreadable, or the build did not emit a recognized summary). Mention this uncertainty; do not invent numbers.',
        );
      }
      return `Automated tests (CodeBuild — same archive the student submitted):\n${parts.map((p) => `- ${p}`).join('\n')}`;
    })();

    const prompt = `You are an experienced teacher reviewing a student's project submission (source files extracted from their zip).

Your task is to provide feedback FOR THE TEACHER, not for the student directly.

Please:
- Summarize what the project appears to do and how complete it looks relative to the assignment.
- List concrete strengths (structure, clarity, correctness, good practices).
- List concrete weaknesses, risks, or missing pieces.
- Suggest how the teacher could coach the student or what to verify manually (you only see text files from the archive, not running code).
- If you suggest points below max, explicitly state what point deductions were applied and why.

Tone and scoring (learning context — keep facts like tests, soften judgment):
- This is coursework, not a startup code review. Be encouraging and proportionate: students should not feel demolished for imperfect but acceptable work.
- If the scope is small or the assignment is introductory and the submission meets the stated goal, suggested points should be high — not mid-range solely because the app is not polished, "clean architecture," or feature-rich.
- Mention minor issues (style, structure, small smells, missing niceties) as optional improvements or "fine for now" unless they actually block learning goals or correctness.
- Reserve clearly lower suggested scores for substantive problems: missing requirements, broken behavior, major misunderstandings, or automated tests showing many failures when tests are available.
- When noting a flaw, balance it: e.g. that it is a small issue and acceptable at this level unless the rubric demands perfection.
- Evaluate in proportion to project complexity. For simple tasks (for example, a tiny calculator with one required test), do not penalize heavily for missing enterprise-level practices.
- Treat weaknesses as either:
  - "Scoring-impacting" only when they violate explicit requirements from the assignment description or teacher assessment notes, or cause incorrect behavior.
  - "Non-impacting improvement suggestions" otherwise.
- Do NOT reduce suggested points for non-impacting issues unless the teacher explicitly requested those criteria in assessment notes/description.
- If requirements are satisfied and tests align with the required scope, suggested points should be near full marks.
- Include a short "Deduction rationale" section in feedback:
  - For each deduction, provide: issue, violated requirement (or "teacher rubric"), and deducted points.
  - If no deductions were applied, explicitly say "No point deductions."
- SuggestedPoints (the numeric field below) must be an integer. If your internal calculation is fractional, round using this rule:
  - decimal part >= 0.5 -> round up
  - decimal part < 0.5 -> round down
- Ensure consistency: the final integer SuggestedPoints must match the deduction rationale after applying the rounding rule.
- If automated test summary indicates zero tests, and assignment description/teacher notes do not explicitly require tests, do NOT deduct points for missing tests.

IMPORTANT:
- Do NOT address the student directly (no "you should...").
- Speak about "the student" and "the submission".
- Some files may be omitted from the archive extract; mention uncertainty where needed.

${testBlock}

Return your answer in this exact format:

FeedbackForTeacher:
<your analysis in plain text>

SuggestedPoints:
<integer between 0 and ${input.maxPoints}, or leave empty if you cannot decide>

---
Project:
Title: ${input.projectTitle}
Description: ${input.projectDescription ?? '(no description)'}
Teacher assessment notes (may be empty):
${input.assessmentPrompt ?? '(none)'}

Max points: ${input.maxPoints}

Extracted project files (paths and contents):
${input.projectFilesXml}`;

    const raw = await this.invoke(prompt, 4096);
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
