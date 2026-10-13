"use client";

import { useActionState as reactUseActionState } from "react";

/**
 * Drop-in replacement for React's `useActionState` that stops a form from wiping what the person
 * typed when the server says "no" (duplicate email, bad PAN, photo too small...).
 *
 * Why it is needed: after a `<form action>` finishes, React resets the form to its starting values,
 * even when the action failed. So every time a server check failed, the person had to type
 * everything again, and a chosen file was lost. On success the reset is still wanted (a sent
 * message should clear its box), so only a failed result keeps the values.
 *
 * How: the wrapper notes whether the action's result was a failure ({ success: false }); the
 * single listener in `FormValueKeeper` then cancels the reset that React is about to do.
 */

let keepValuesOnNextReset = false;

function isFailure(result: unknown): boolean {
  return (
    typeof result === "object" &&
    result !== null &&
    "success" in result &&
    (result as { success: unknown }).success === false
  );
}

/** Read by `FormValueKeeper`: true once, right after a failed action. */
export function consumeKeepValuesFlag(): boolean {
  const keep = keepValuesOnNextReset;
  keepValuesOnNextReset = false;
  return keep;
}

export function useActionState<State, Payload = FormData>(
  action: (state: Awaited<State>, payload: Payload) => State | Promise<State>,
  initialState: Awaited<State>,
): [state: Awaited<State>, dispatch: (payload: Payload) => void, isPending: boolean] {
  return reactUseActionState<State, Payload>(async (state, payload) => {
    const result = await action(state, payload);
    keepValuesOnNextReset = isFailure(result);
    return result;
  }, initialState);
}
