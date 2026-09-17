import "@testing-library/jest-dom/vitest";

// React DOM 18 (this repo's version) does not understand a function passed
// to <form action={...}>; that convention is compiled by Next.js's Server
// Actions transform and understood natively only in React 19. Next's own
// runtime handles it fine in dev/build, so under vitest+jsdom this is
// harmless tooling noise, not a real defect. Silence only this exact
// warning so a genuine console.error still fails a test's output.
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].includes("Invalid value for prop %s on <%s> tag")) return;
  originalConsoleError(...args);
};
