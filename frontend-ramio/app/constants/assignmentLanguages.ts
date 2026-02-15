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
};

export function getAssignmentLanguageLabel(language: AssignmentLanguage): string {
  return ASSIGNMENT_LANGUAGE_MAP[language].label;
}

export function getAssignmentLanguageFileExtension(language: AssignmentLanguage): string {
  return ASSIGNMENT_LANGUAGE_MAP[language].fileExtension;
}
