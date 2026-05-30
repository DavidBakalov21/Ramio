import { regionFromLambdaArn } from './project-zip-to-prompt.service';

describe('regionFromLambdaArn', () => {
  it('extracts region from a valid Lambda ARN', () => {
    expect(
      regionFromLambdaArn(
        'arn:aws:lambda:eu-west-1:123456789012:function:project-zip-to-prompt',
      ),
    ).toBe('eu-west-1');
  });

  it('returns undefined for a non-ARN string', () => {
    expect(regionFromLambdaArn('not-an-arn')).toBeUndefined();
    expect(regionFromLambdaArn('')).toBeUndefined();
  });
});
