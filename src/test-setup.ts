import "@testing-library/jest-dom/vitest";

// React DOM 18 (this repo's version) does not understand a function passed
// to <form action={...}>; that convention is compiled by Next.js's Server
// Actions transform and understood natively only in React 19. Next's own
// runtime handles it fine in dev/build, so under vitest+jsdom this is
// harmless tooling noise, not a real defect. Silence only this exact React 18
// <form action={fn}> warning under jsdom; it does not make console output
// fail tests otherwise.
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const text = args.map(String).join(" ");
  if (text.includes("Invalid value for prop %s on <%s> tag") && text.includes("action")) return;
  originalConsoleError(...args);
};
