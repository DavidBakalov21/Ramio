import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

export type TestLanguage = 'python' | 'javascript';

interface InvokeResponseBody {
  content?: Array<{ text: string }>;
}

function stripMarkdownCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:\w+)?\s*\n?([\s\S]*?)\n?```$/);
  return match ? match[1].trim() : trimmed;
}

function toInferenceProfileId(
  modelId: string,
  region: string,
): string {
  if (
    modelId.startsWith('us.') ||
    modelId.startsWith('eu.') ||
    modelId.startsWith('apac.')
  ) {
    return modelId;
  }
  const prefix =
    region.startsWith('eu') ? 'eu.' :
    region.startsWith('us') ? 'us.' :
    region.startsWith('ap') ? 'apac.' :
    'us.';
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
    const region =
      this.config.get<string>('BEDROCK_REGION') ?? 'eu-north-1';
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

  async generateUnitTests(
    sourceCode: string,
    language: TestLanguage = 'python',
  ): Promise<string> {
    const framework =
      language === 'python'
        ? 'Python unittest'
        : 'JavaScript/Node.js with Jest';

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
    const framework =
      language === 'python'
        ? 'Python unittest'
        : 'JavaScript/Node.js with Jest';

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
