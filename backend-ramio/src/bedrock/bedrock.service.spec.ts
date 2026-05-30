import { toInferenceProfileId } from './bedrock.service';

jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn(),
  InvokeModelCommand: jest.fn(),
}));

describe('toInferenceProfileId', () => {
  const modelId = 'anthropic.claude-haiku-4-5-20251001-v1:0';

  it('passes through us.-prefixed model ids', () => {
    expect(toInferenceProfileId('us.my-model', 'eu-north-1')).toBe('us.my-model');
  });

  it('passes through eu.-prefixed model ids', () => {
    expect(toInferenceProfileId('eu.my-model', 'us-east-1')).toBe('eu.my-model');
  });

  it('passes through apac.-prefixed model ids', () => {
    expect(toInferenceProfileId('apac.my-model', 'ap-southeast-1')).toBe(
      'apac.my-model',
    );
  });

  it('eu-north-1 → eu. prefix', () => {
    expect(toInferenceProfileId(modelId, 'eu-north-1')).toBe(`eu.${modelId}`);
  });

  it('us-east-1 → us. prefix', () => {
    expect(toInferenceProfileId(modelId, 'us-east-1')).toBe(`us.${modelId}`);
  });

  it('ap-southeast-1 → apac. prefix', () => {
    expect(toInferenceProfileId(modelId, 'ap-southeast-1')).toBe(`apac.${modelId}`);
  });

  it('unknown region defaults to us.', () => {
    expect(toInferenceProfileId(modelId, 'ca-central-1')).toBe(`us.${modelId}`);
  });
});
