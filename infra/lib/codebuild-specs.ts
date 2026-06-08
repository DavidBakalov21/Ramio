
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
        'if command -v dnf >/dev/null; then dnf install -y cmake gcc-c++ make gtest-devel; elif command -v yum >/dev/null; then yum install -y cmake3 gcc-c++ make gtest-devel; else apt-get update && apt-get install -y cmake g++ make libgtest-dev; fi',
      ],
    },
    build: {
      commands: [
        'set -e',
        'CMAKE=cmake; command -v cmake >/dev/null || CMAKE=cmake3',
        [
          'if [ "$(find . -maxdepth 1 -mindepth 1 -type d | wc -l | tr -d " ")" = "1" ]',
          '&& [ "$(find . -maxdepth 1 -mindepth 1 -type f | wc -l | tr -d " ")" = "0" ]; then',
          'cd "$(find . -maxdepth 1 -mindepth 1 -type d | head -1)";',
          'fi',
        ].join(' '),
        [
          'if [ -f CMakeLists.txt ]; then',
          '$CMAKE -S . -B build && $CMAKE --build build && ctest --test-dir build --output-on-failure -V;',
          'elif [ -f Makefile ] || [ -f makefile ]; then',
          'make test;',
          'else',
          'CMAKE_FILE="$(find . -name CMakeLists.txt -not -path "*/build/*" -not -path "*/.git/*" 2>/dev/null | awk \'{print length, $0}\' | sort -n | head -1 | cut -d" " -f2-)";',
          'if [ -n "$CMAKE_FILE" ]; then',
          'cd "$(dirname "$CMAKE_FILE")" && $CMAKE -S . -B build && $CMAKE --build build && ctest --test-dir build --output-on-failure -V;',
          'elif [ -f Solution.cpp ] && [ -f SolutionTest.cpp ]; then',
          'g++ -std=c++17 -Wall -Wextra -O0 Solution.cpp SolutionTest.cpp -o solution_test && ./solution_test;',
          'else',
          'TEST_CPP="$(find . \\( -path ./.git -o -path ./build \\) -prune -o -type f \\( -iname \'*_test.cpp\' -o -iname \'*Test.cpp\' -o -iname \'test_*.cpp\' \\) -print 2>/dev/null | awk \'{print length, $0}\' | sort -n | head -1 | cut -d\\" \\" -f2-)";',
          'if [ -n "$TEST_CPP" ]; then',
          'INC_FLAGS="";',
          'for d in include inc src .; do [ -d "$d" ] && INC_FLAGS="$INC_FLAGS -I$d"; done;',
          'SRC_CPPS="";',
          'if [ -d src ]; then SRC_CPPS="$(find src -name \'*.cpp\' | tr \'\\n\' \' \')"; fi;',
          'if [ -z "$SRC_CPPS" ]; then',
          'TEST_DIR="$(dirname "$TEST_CPP")";',
          'SRC_CPPS="$(find . \\( -path ./.git -o -path ./build -o -path "./$TEST_DIR" \\) -prune -o -type f -name \'*.cpp\' -print 2>/dev/null | tr \'\\n\' \' \')";',
          'fi;',
          'GTEST_LIBS="";',
          'if grep -Eq \'#include [<"]gtest\' "$TEST_CPP" 2>/dev/null; then GTEST_LIBS="-lgtest -lgtest_main -pthread"; fi;',
          'g++ -std=c++17 -Wall -Wextra -O0 $INC_FLAGS $SRC_CPPS "$TEST_CPP" -o ramio_cpp_test $GTEST_LIBS && ./ramio_cpp_test;',
          'else',
          'echo "No CMakeLists.txt, Makefile, Solution.cpp/SolutionTest.cpp, or *_test.cpp layout found";',
          'echo "Archive contents (first 40 files):";',
          'find . -type f | head -40;',
          'exit 1;',
          'fi;',
          'fi;',
          'fi',
        ].join(' '),
      ],
    },
  },
};
