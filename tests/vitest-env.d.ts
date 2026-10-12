/// <reference types="@testing-library/jest-dom" />
/// <reference types="vitest/globals" />

declare namespace Vi {
  interface JestAssertion<T> {
    toHaveTextContent(text: string | RegExp): T;
    toBeInTheDocument(): T;
    toBeDisabled(): T;
    toHaveAttribute(name: string, value?: string): T;
  }
}