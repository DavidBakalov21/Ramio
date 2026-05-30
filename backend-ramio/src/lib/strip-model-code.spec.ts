import { stripModelCodeOutput } from './strip-model-code';

describe('stripModelCodeOutput', () => {
  it('raw Python starting with import → returned as-is even if backticks appear later', () => {
    const input = 'import os\nprint("hello")\n```not a fence```';
    expect(stripModelCodeOutput(input)).toBe(input);
  });

  it('raw Python starting with def → returned as-is even if backticks appear later', () => {
    const input = 'def foo():\n    pass\n```later```';
    expect(stripModelCodeOutput(input)).toBe(input);
  });

  it('raw Python starting with class → returned as-is even if backticks appear later', () => {
    const input = 'class Foo:\n    pass\n```later```';
    expect(stripModelCodeOutput(input)).toBe(input);
  });

  it('raw Python starting with # → returned as-is even if backticks appear later', () => {
    const input = '# comment\nx = 1\n```later```';
    expect(stripModelCodeOutput(input)).toBe(input);
  });

  it('raw Python starting with @ → returned as-is even if backticks appear later', () => {
    const input = '@decorator\ndef foo(): pass\n```later```';
    expect(stripModelCodeOutput(input)).toBe(input);
  });

  it('raw Python starting with """ → returned as-is even if backticks appear later', () => {
    const input = '"""docstring"""\ndef foo(): pass\n```later```';
    expect(stripModelCodeOutput(input)).toBe(input);
  });

  it('whole-file ```python ... ``` fence → inner content, language tag stripped', () => {
    const input = '```python\nimport os\nprint(1)\n```';
    expect(stripModelCodeOutput(input)).toBe('import os\nprint(1)');
  });

  it('fence with no language tag → inner content', () => {
    const input = '```\nimport os\nprint(1)\n```';
    expect(stripModelCodeOutput(input)).toBe('import os\nprint(1)');
  });

  it('prose around a fence → first fenced block extracted', () => {
    const input =
      'Here is the solution:\n```python\nimport os\nprint(1)\n```\nEnjoy!';
    expect(stripModelCodeOutput(input)).toBe('import os\nprint(1)');
  });

  it('leading BOM stripped; surrounding whitespace trimmed', () => {
    const input = '\uFEFF  ```python\nx = 1\n```  ';
    expect(stripModelCodeOutput(input)).toBe('x = 1');
  });

  it('CRLF line endings handled', () => {
    const input = '```python\r\nimport os\r\nprint(1)\r\n```';
    expect(stripModelCodeOutput(input)).toBe('import os\r\nprint(1)');
  });

  it('plain text, no fence, not Python-looking → returned trimmed, unchanged', () => {
    const input = '  This is just prose with no code.  ';
    expect(stripModelCodeOutput(input)).toBe('This is just prose with no code.');
  });
});
