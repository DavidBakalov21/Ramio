import { regionFromLambdaArn } from './github-repo-to-s3.service';

describe('regionFromLambdaArn', () => {
  it('extracts region from a valid Lambda ARN', () => {
    expect(
      regionFromLambdaArn(
        'arn:aws:lambda:us-east-1:999999999999:function:github-repo-to-s3',
      ),
    ).toBe('us-east-1');
  });

  it('returns undefined for a non-ARN string', () => {
    expect(regionFromLambdaArn('lambda-only-name')).toBeUndefined();
  });
});
