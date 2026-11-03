import { expect } from "bun:test";
import { RenderError } from "../../src/errors.ts";

/**
 * Runs a function that must throw a RenderError, and returns that error.
 * Each failure is an assertion: a call that returns, or that throws another error, fails the expect.
 */
export function rejection(fn: () => unknown): RenderError {
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(RenderError);
  return caught as RenderError;
}

/**
 * Awaits a promise that must reject with a RenderError, and returns that error.
 * Each failure is an assertion: a promise that resolves, or that rejects with another error, fails the expect.
 */
export async function rejectionOf(promise: Promise<unknown>): Promise<RenderError> {
  let caught: unknown;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(RenderError);
  return caught as RenderError;
}

/** Runs a function that must return, and returns its value. A throw fails as an assertion. */
export function returned<T>(fn: () => T): T {
  let value: T | undefined;
  let thrown: unknown;
  try {
    value = fn();
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeUndefined();
  return value as T;
}

/** Returns the value of a promise that must resolve. A rejection fails as an assertion. */
export async function resolved<T>(promise: Promise<T>): Promise<T> {
  await expect(promise).resolves.toBeDefined();
  return promise;
}
