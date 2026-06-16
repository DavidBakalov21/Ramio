
#pragma once

#include <cxxabi.h>

#include <cmath>
#include <cstdlib>
#include <cstring>
#include <functional>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <typeinfo>
#include <vector>

namespace Microsoft {
namespace VisualStudio {
namespace CppUnitTestFramework {

namespace Detail {

template <typename T>
struct RamioTestClassTypedef {
  using TheClass = T;
};

inline std::string demangleTypeName(const char* mangled) {
  if (mangled == nullptr) {
    return "UnknownSuite";
  }
  int status = 0;
  std::unique_ptr<char, void (*)(void*)> demangled(
      abi::__cxa_demangle(mangled, nullptr, nullptr, &status),
      std::free);
  if (status == 0 && demangled) {
    return demangled.get();
  }
  return mangled;
}

template <typename T>
inline const char* suiteNameFor() {
  static const std::string name = demangleTypeName(typeid(T).name());
  return name.c_str();
}

inline std::vector<std::function<void()>>& registeredTests() {
  static std::vector<std::function<void()>> tests;
  return tests;
}

inline void registerTest(const char* suite, const char* method,
                         std::function<void()> fn) {
  registeredTests().push_back([suite, method, fn = std::move(fn)]() {
    std::cout << "[ RUN      ] " << suite << "." << method << std::endl;
    try {
      fn();
      std::cout << "[       OK ] " << suite << "." << method << std::endl;
    } catch (const std::exception& e) {
      std::cout << "[  FAILED  ] " << suite << "." << method << " ("
                << e.what() << ")" << std::endl;
      throw;
    }
  });
}

[[noreturn]] inline void fail(const char* what,
                              const wchar_t* message = nullptr) {
  if (message != nullptr && message[0] != L'\0') {
    std::string msg;
    for (const wchar_t* p = message; *p; ++p) {
      msg.push_back(static_cast<char>(*p));
    }
    throw std::runtime_error(std::string(what) + ": " + msg);
  }
  throw std::runtime_error(what);
}

inline int runAll() {
  int failed = 0;
  const auto& tests = registeredTests();
  if (tests.empty()) {
    std::cerr << "No tests registered." << std::endl;
    return 1;
  }
  for (const auto& test : tests) {
    try {
      test();
    } catch (...) {
      failed++;
    }
  }
  std::cout << "[==========] " << tests.size() << " tests ran." << std::endl;
  if (failed == 0) {
    std::cout << "[  PASSED  ] " << tests.size() << " tests." << std::endl;
    return 0;
  }
  std::cout << "[  FAILED  ] " << failed << " tests." << std::endl;
  return 1;
}

}

class Assert {
 public:
  static void IsTrue(bool condition, const wchar_t* message = nullptr) {
    if (!condition) {
      Detail::fail("IsTrue failed", message);
    }
  }

  static void IsFalse(bool condition, const wchar_t* message = nullptr) {
    if (condition) {
      Detail::fail("IsFalse failed", message);
    }
  }

  static void AreEqual(bool expected, bool actual,
                       const wchar_t* message = nullptr) {
    if (expected != actual) {
      Detail::fail("AreEqual failed", message);
    }
  }

  static void AreEqual(int expected, int actual,
                       const wchar_t* message = nullptr) {
    if (expected != actual) {
      Detail::fail("AreEqual failed", message);
    }
  }

  static void AreEqual(long expected, long actual,
                       const wchar_t* message = nullptr) {
    if (expected != actual) {
      Detail::fail("AreEqual failed", message);
    }
  }

  static void AreEqual(long long expected, long long actual,
                       const wchar_t* message = nullptr) {
    if (expected != actual) {
      Detail::fail("AreEqual failed", message);
    }
  }

  static void AreEqual(unsigned int expected, unsigned int actual,
                       const wchar_t* message = nullptr) {
    if (expected != actual) {
      Detail::fail("AreEqual failed", message);
    }
  }

  static void AreEqual(size_t expected, size_t actual,
                       const wchar_t* message = nullptr) {
    if (expected != actual) {
      Detail::fail("AreEqual failed", message);
    }
  }

  static void AreEqual(double expected, double actual, double delta,
                       const wchar_t* message = nullptr) {
    if (std::fabs(expected - actual) > delta) {
      Detail::fail("AreEqual failed", message);
    }
  }

  static void AreEqual(float expected, float actual, float delta,
                       const wchar_t* message = nullptr) {
    if (std::fabs(expected - actual) > delta) {
      Detail::fail("AreEqual failed", message);
    }
  }

  static void AreEqual(const char* expected, const char* actual,
                       const wchar_t* message = nullptr) {
    if (std::strcmp(expected, actual) != 0) {
      Detail::fail("AreEqual failed", message);
    }
  }

  static void AreEqual(const wchar_t* expected, const wchar_t* actual,
                       const wchar_t* message = nullptr) {
    if (std::wcscmp(expected, actual) != 0) {
      Detail::fail("AreEqual failed", message);
    }
  }

  template <typename T>
  static void AreEqual(const T& expected, const T& actual,
                       const wchar_t* message = nullptr) {
    if (!(expected == actual)) {
      Detail::fail("AreEqual failed", message);
    }
  }

  static void IsNull(const void* pointer, const wchar_t* message = nullptr) {
    if (pointer != nullptr) {
      Detail::fail("IsNull failed", message);
    }
  }

  static void IsNotNull(const void* pointer, const wchar_t* message = nullptr) {
    if (pointer == nullptr) {
      Detail::fail("IsNotNull failed", message);
    }
  }

  static void Fail(const wchar_t* message = nullptr) {
    Detail::fail("Fail", message);
  }

  template <typename ExpectedException, typename Functor>
  static void ExpectException(Functor functor,
                              const wchar_t* message = nullptr) {
    try {
      functor();
    } catch (const ExpectedException&) {
      return;
    } catch (...) {
      Detail::fail("ExpectException failed: wrong exception type", message);
    }
    Detail::fail("ExpectException failed: no exception thrown", message);
  }

  template <typename ExpectedException, typename ReturnType>
  static void ExpectException(ReturnType (*func)(),
                              const wchar_t* message = nullptr) {
    ExpectException<ExpectedException>(func, message);
  }
};

struct TestClass {};

}
}
}

#define TEST_CLASS(ClassName)                                                \
  struct ClassName                                                           \
      : public ::Microsoft::VisualStudio::CppUnitTestFramework::TestClass,   \
        private ::Microsoft::VisualStudio::CppUnitTestFramework::Detail::  \
            RamioTestClassTypedef<ClassName>

#define TEST_METHOD(MethodName)                                              \
  static inline struct MethodName##_ramio_reg {                              \
    MethodName##_ramio_reg() {                                               \
      using Suite = TheClass;                                                \
      ::Microsoft::VisualStudio::CppUnitTestFramework::Detail::registerTest( \
          ::Microsoft::VisualStudio::CppUnitTestFramework::Detail::          \
              suiteNameFor<Suite>(),                                         \
          #MethodName, []() {                                                \
            Suite instance;                                                  \
            instance.MethodName();                                           \
          });                                                                \
    }                                                                        \
  } MethodName##_ramio_reg_instance;                                         \
  void MethodName()

#define TEST_METHOD_INITIALIZE(MethodName) void MethodName()
#define TEST_METHOD_CLEANUP(MethodName) void MethodName()
#define TEST_CLASS_INITIALIZE(MethodName) void MethodName()
#define TEST_CLASS_CLEANUP(MethodName) void MethodName()

int main() {
  return ::Microsoft::VisualStudio::CppUnitTestFramework::Detail::runAll();
}
