import type { AssignmentLanguage } from '@/app/interfaces/Assignment';

export const ASSIGNMENT_LANGUAGE_MAP: Record<
  AssignmentLanguage,
  {
    label: string;
    fileExtension: string;
    testCodeHint: string;
    testCodePlaceholder: string;
  }
> = {
  PYTHON: {
    label: 'Python',
    fileExtension: 'py',
    testCodeHint: 'Enter Python test code. It will be saved as test.py.',
    testCodePlaceholder: '# e.g. unittest or pytest',
  },
  NODE_JS: {
    label: 'Node.js',
    fileExtension: 'js',
    testCodeHint: 'Enter Node.js test code. It will be saved as test.js.',
    testCodePlaceholder: '// e.g. run tests or assertions',
  },
  JAVA: {
    label: 'Java',
    fileExtension: 'java',
    testCodeHint: 'Enter Java test code. It will be saved as test.java.',
    testCodePlaceholder: '// e.g. class SolutionTest with checks in main()',
  },
  DOTNET: {
    label: '.NET (C#)',
    fileExtension: 'cs',
    testCodeHint: 'Enter C# test code. It will be saved as test.cs.',
    testCodePlaceholder: '// e.g. static checks and throw on failures',
  },
};

export function getAssignmentLanguageLabel(language: AssignmentLanguage): string {
  return ASSIGNMENT_LANGUAGE_MAP[language].label;
}

export function getAssignmentLanguageFileExtension(language: AssignmentLanguage): string {
  return ASSIGNMENT_LANGUAGE_MAP[language].fileExtension;
}
