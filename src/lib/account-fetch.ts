/**
 * `fetch` for actions that need an account, from client components a guest
 * can reach (home, search, lists, pantry, recipes). Only for something the
 * person tapped: a read that runs on load or while typing must use plain
 * `fetch`, or a 401 there would carry a guest off the page they are reading.
 *
 * Guests browse real pages, but every write answers 401. Each caller checked
 * `res.ok` and returned, so a guest tapping Watch, the bell, Add to list or
 * Create list saw nothing happen at all (audit 2026-10-12, §3.5). A 401 now
 * takes them to sign in, which is what the product page always did. The
 * response is still returned, so callers' own `!res.ok` handling stays as is.
 */
export async function accountFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401) signInToContinue();
  return res;
}

/** Send the person to sign in. Guest mode lets /signin through. */
export function signInToContinue(): void {
  window.location.assign("/signin");
}
