

## Set a New LOAD_TEST_SECRET

### What will happen

1. Set a new `LOAD_TEST_SECRET` value in the backend secrets (replacing the old one)
2. The recommended value is a strong random string: `lt-secret-2026-Feb15-k9Xm4pQzR7wJ`

### Steps

1. **Set the secret** -- You'll be prompted to input the new value. Use: `lt-secret-2026-Feb15-k9Xm4pQzR7wJ` (or any strong string you prefer)
2. **Redeploy the edge function** -- The `mint-load-test-headers` function will be redeployed to pick up the new secret
3. **Set it in your terminal** -- Run:
   ```bash
   export LOAD_TEST_SECRET="lt-secret-2026-Feb15-k9Xm4pQzR7wJ"
   ```

### Technical details

- The `LOAD_TEST_SECRET` is used by Gate 2 of the `mint-load-test-headers` edge function
- It is read via `Deno.env.get("LOAD_TEST_SECRET")` and compared against the `X-LoadTest-Secret` request header
- Changing this secret invalidates any previously distributed value immediately

