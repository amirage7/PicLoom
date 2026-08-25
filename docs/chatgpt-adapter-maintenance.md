# ChatGPT page adapter maintenance

The desktop integration automates the ordinary ChatGPT website. It does not use
the OpenAI API or Codex. The DOM integration is unofficial and can break when
ChatGPT changes its page structure.

## Safety boundary

- Inspect visible DOM only.
- Never read cookies, local storage, session storage, account names, or tokens.
- Collect images only from assistant responses created after the submission boundary.
- Never infer completion from avatars, prior turns, prompt uploads, or page chrome.
- Never resubmit a prompt automatically after a timeout or restart.

## Updating fixtures

1. Open a disposable ChatGPT conversation manually.
2. Copy only the smallest relevant DOM fragment for the state being tested.
3. Replace conversation IDs, URLs, text, names, and image bytes with deterministic placeholders.
4. Confirm the fixture contains no account identifiers, cookies, authorization values, or private conversation text.
5. Save it under `desktop/tests/fixtures/chatgpt/`.
6. Update selectors from semantic attributes to structural fallbacks.
7. Increment `CHATGPT_ADAPTER_VERSION` in `desktop/src/chatgpt/adapter.ts`.
8. Run:

```powershell
cd desktop
npm.cmd test -- --run tests/chatgptAdapter.test.ts
npm.cmd run typecheck
```

## Manual confirmation

After tests pass, use a disposable conversation and verify:

- signed-out pages become `login_required`;
- the composer becomes `ready`;
- the visible stop control becomes `generating`;
- only images in the new assistant response become `completed`;
- explicit refusals and usage limits remain distinct;
- an unknown layout becomes `page_changed` and keeps the page visible.

Do not record screenshots containing account identity, chat history, signed URLs,
or generated image bytes in the repository.
