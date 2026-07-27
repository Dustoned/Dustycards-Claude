// Vitest alias target for the "server-only" package: the real package throws
// outside a React Server environment, which would block unit tests from
// importing server-side libraries. Tests run in Node, which is server enough.
export {};
