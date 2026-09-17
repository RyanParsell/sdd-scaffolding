<!-- EDIT-MECHANISM:START -->
> ## Edit mechanism — tracked content goes through the literal-text file tools
>
> Edit tracked files with the harness's literal-text file tools (Edit/Write) — never `sed -i`, `perl -i`,
> a Python text-mode round-trip, or a heredoc / `node -e` string carrying document-shaped content. Each
> has corrupted a repository silently: whole-file LF rewrites and NUL bytes (`sed -i`), skills flipped
> CRLF→LF with an empty `git diff` (Python text mode), a thousands-of-lines diff for a small change (an
> edit tool in a worktree with the other line ending), terms replaced by empty strings (bare backticks in
> a double-quoted shell string), and a regex edited to a valid-but-wrong pattern that built and passed.
>
> When a script rewrite is genuinely warranted, scope the file list with `grep -l` (never a bare glob),
> then:
> 1. **`git diff --numstat`** — a whole-file rewrite for an N-site substitution means the endings changed;
>    re-read/replace/write preserving the file's convention, never accept the churn.
> 2. **Byte-check the first edited file** for CRLF/LF and BOM with a byte read or `file(1)` — not
>    `git diff`, MSYS `grep` or `awk`, which strip CR in text mode. Match the file's own convention (the
>    profile document states which ending the working copies use) and preserve any BOM.
> 3. **Re-validate any construct with escaping depth** (regex, glob, path pattern): re-read it and confirm
>    it still parses and still says what it meant — bracket balance, branch count — not merely that the
>    replacement applied. A semantically valid wrong value is silent forever.
> 4. **A file-based edit script matches the target's line endings and asserts its replacement count** — a
>    `.replace()` built with `\n` against a CRLF file matches nothing and reports success.
>
> Stated once here; implementer briefs (contracts A and B), post-impl's Markdown phases and
> sdd-skill-improve's parity check cite it by name.
<!-- EDIT-MECHANISM:END -->
