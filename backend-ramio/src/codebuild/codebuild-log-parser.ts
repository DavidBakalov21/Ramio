/**
 * Best-effort parsing of common test runner summaries from CodeBuild / CloudWatch log text.
 */

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[\d;?]*[\dA-Za-z]/g, '');
}

export function parseTestCountsFromBuildLog(log: string): {
  passed: number;
  failed: number;
  skipped: number;
} | null {
  const text = stripAnsi(log).replace(/\r\n/g, '\n');

  const jestFailedPassedTotal = text.match(
    /Tests:\s+(\d+)\s+failed,\s*(\d+)\s+passed,\s*(\d+)\s+total/i,
  );
  if (jestFailedPassedTotal) {
    const failed = Number(jestFailedPassedTotal[1]);
    const passed = Number(jestFailedPassedTotal[2]);
    const total = Number(jestFailedPassedTotal[3]);
    const skipped = Math.max(0, total - passed - failed);
    return { passed, failed, skipped };
  }

  const jestPassedTotal = text.match(
    /Tests:\s+(\d+)\s+passed,\s*(\d+)\s+total/i,
  );
  if (jestPassedTotal) {
    const passed = Number(jestPassedTotal[1]);
    const total = Number(jestPassedTotal[2]);
    return {
      passed,
      failed: 0,
      skipped: Math.max(0, total - passed),
    };
  }

  const jestSuitesFailedPassed = text.match(
    /Test Suites:\s+(\d+)\s+failed,\s*(\d+)\s+passed,\s*(\d+)\s+total/i,
  );
  if (jestSuitesFailedPassed) {
    const failed = Number(jestSuitesFailedPassed[1]);
    const passed = Number(jestSuitesFailedPassed[2]);
    const total = Number(jestSuitesFailedPassed[3]);
    const skipped = Math.max(0, total - passed - failed);
    return { passed, failed, skipped };
  }

  const jestSuitesPassedTotal = text.match(
    /Test Suites:\s+(\d+)\s+passed,\s*(\d+)\s+total/i,
  );
  if (jestSuitesPassedTotal) {
    const passed = Number(jestSuitesPassedTotal[1]);
    const total = Number(jestSuitesPassedTotal[2]);
    return {
      passed,
      failed: 0,
      skipped: Math.max(0, total - passed),
    };
  }

  const pytestLine = text.match(
    /=+\s*([\s\S]*?)\s+in\s+[\d.]+s\s*=+/,
  );
  const pytestChunk = pytestLine ? pytestLine[1] : text;
  let pPassed = 0;
  let pFailed = 0;
  let pSkipped = 0;
  const pp = pytestChunk.match(/(\d+)\s+passed\b/i);
  const pf = pytestChunk.match(/(\d+)\s+failed\b/i);
  const ps = pytestChunk.match(/(\d+)\s+skipped\b/i);
  const perror = pytestChunk.match(/(\d+)\s+error(?:s)?\b/i);
  if (pp) pPassed = Number(pp[1]);
  if (pf) pFailed = Number(pf[1]);
  if (ps) pSkipped = Number(ps[1]);
  if (perror) pFailed += Number(perror[1]);
  if (pp || pf || ps || perror) {
    return { passed: pPassed, failed: pFailed, skipped: pSkipped };
  }

  const ranMatch = text.match(/Ran (\d+) tests? in/m);
  if (ranMatch) {
    const total = Number(ranMatch[1]);
    if (/\nOK\s*$/m.test(text) || /\bOK\b\s*$/m.test(text.trim())) {
      return { passed: total, failed: 0, skipped: 0 };
    }
    const failM = text.match(/FAILED \(failures=(\d+)\)/);
    const errM = text.match(/FAILED \(errors=(\d+)\)/);
    const errCountM = text.match(/errors=(\d+)/);
    const failures = failM ? Number(failM[1]) : 0;
    let errors = 0;
    if (errM) errors = Number(errM[1]);
    else if (errCountM && text.includes('FAILED')) {
      errors = Number(errCountM[1]);
    }
    if (failM || errM || (text.includes('FAILED') && failures + errors > 0)) {
      const failed = failures + errors;
      return {
        passed: Math.max(0, total - failed),
        failed,
        skipped: 0,
      };
    }
  }

  const dotnet = text.match(
    /Failed!\s+-\s+Failed:\s+(\d+),\s+Passed:\s+(\d+)/i,
  );
  if (dotnet) {
    return {
      passed: Number(dotnet[2]),
      failed: Number(dotnet[1]),
      skipped: 0,
    };
  }

  const mavenFull = text.match(
    /Tests run:\s*(\d+),\s*Failures:\s*(\d+),\s*Errors:\s*(\d+)(?:,\s*Skipped:\s*(\d+))?/i,
  );
  if (mavenFull) {
    const run = Number(mavenFull[1]);
    const failures = Number(mavenFull[2]);
    const errors = Number(mavenFull[3]);
    const skipped = mavenFull[4] ? Number(mavenFull[4]) : 0;
    const failed = failures + errors;
    return {
      passed: Math.max(0, run - failed - skipped),
      failed,
      skipped,
    };
  }

  const maven = text.match(/Tests run:\s*(\d+),\s*Failures:\s*(\d+)/i);
  if (maven) {
    const run = Number(maven[1]);
    const failures = Number(maven[2]);
    return {
      passed: Math.max(0, run - failures),
      failed: failures,
      skipped: 0,
    };
  }

  const mochaPassing = text.match(/\b(\d+)\s+passing\b/i);
  if (mochaPassing) {
    const passed = Number(mochaPassing[1]);
    const failing = text.match(/\b(\d+)\s+failing\b/i);
    return {
      passed,
      failed: failing ? Number(failing[1]) : 0,
      skipped: 0,
    };
  }

  const gradle = text.match(
    /(\d+)\s+tests?\s+completed(?:,\s*(\d+)\s+failed)?/i,
  );
  if (gradle) {
    const completed = Number(gradle[1]);
    const failed = gradle[2] ? Number(gradle[2]) : 0;
    return {
      passed: Math.max(0, completed - failed),
      failed,
      skipped: 0,
    };
  }

  const cargo = text.match(
    /test result:\s*(?:ok|FAILED)\.\s*(\d+)\s+passed;\s*(\d+)\s+failed;\s*(\d+)\s+ignored/i,
  );
  if (cargo) {
    return {
      passed: Number(cargo[1]),
      failed: Number(cargo[2]),
      skipped: Number(cargo[3]),
    };
  }

  return null;
}
