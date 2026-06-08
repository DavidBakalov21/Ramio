
export const PYTHON_BUILDSPEC = {
  version: '0.2',
  phases: {
    install: {
      'runtime-versions': { python: '3.12' },
      commands: ['pip install --upgrade pip'],
    },
    build: {
      commands: [
        'set -e',
        'if [ -f requirements.txt ]; then pip install -r requirements.txt; fi',
        'if [ -f requirements-dev.txt ]; then pip install -r requirements-dev.txt; fi',
        'if python -m pytest --version >/dev/null 2>&1; then python -m pytest -v; else python -m unittest discover -s . -p "test*.py" -v; fi',
      ],
    },
  },
};

export const NODE_JS_BUILDSPEC = {
  version: '0.2',
  phases: {
    install: {
      'runtime-versions': { nodejs: '20' },
    },
    build: {
      commands: [
        'set -e',
        'if [ -f package-lock.json ]; then npm ci; elif [ -f package.json ]; then npm install; else echo "No package.json found"; exit 1; fi',
        'npm test --if-present || npx --yes jest --ci --runInBand',
      ],
    },
  },
};

export const JAVA_BUILDSPEC = {
  version: '0.2',
  phases: {
    install: {
      'runtime-versions': { java: 'corretto21' },
    },
    build: {
      commands: [
        'set -e',
        'if [ -f gradlew ]; then chmod +x gradlew && ./gradlew test; elif [ -f pom.xml ]; then mvn -B test; else echo "No gradlew or pom.xml found"; exit 1; fi',
      ],
    },
  },
};

export const DOTNET_BUILDSPEC = {
  version: '0.2',
  phases: {
    install: {
      'runtime-versions': { dotnet: '8.0' },
    },
    build: {
      commands: [
        'set -e',
        'dotnet restore',
        'dotnet test --no-restore --verbosity normal',
      ],
    },
  },
};

export const CPP_BUILDSPEC = {
  version: '0.2',
  phases: {
    install: {
      commands: [
        'set -e',
        'if command -v dnf >/dev/null; then dnf install -y cmake gcc-c++ make; elif command -v yum >/dev/null; then yum install -y cmake3 gcc-c++ make; else apt-get update && apt-get install -y cmake g++ make; fi',
      ],
    },
    build: {
      commands: [
        'set -e',
        'CMAKE=cmake; command -v cmake >/dev/null || CMAKE=cmake3',
        'if [ -f CMakeLists.txt ]; then $CMAKE -S . -B build && $CMAKE --build build && ctest --test-dir build --output-on-failure -V; elif [ -f Makefile ]; then make test; else echo "No CMakeLists.txt or Makefile found"; exit 1; fi',
      ],
    },
  },
};
