# Testing

## Deuterocanon-only words

These are present in `data/kjv-apocrypha/words.json` and absent from `data/kjv/words.json`, so they are useful for source-sensitive tests:

- `baggage`
  Reference examples: `2 Maccabees 12:21`, `Judith 7:2`
- `authors`
  Reference examples: `1 Maccabees 9:61`, `Baruch 3:23`

## Fixture set

The harness covers these cases:

- Same word several times
  Based on [PriyankaLahiri_/status/1598966813333020672](https://x.com/PriyankaLahiri_/status/1598966813333020672) from 2022-12-03, using the repeated phrase `Go go go!!`
- No words
  Based on [panyiszabolcs/status/2001231555390238737](https://x.com/panyiszabolcs/status/2001231555390238737) from 2025-12-17, whose visible text is only a link
- Weird UTF-8 / emoji
  Synthetic fixture using accented text plus emoji so normalization stays deterministic
- Multiple links
  Based on [kardashevscale1/status/2025270342386942137](https://x.com/kardashevscale1/status/2025270342386942137) from 2026-02-21, reduced to a stable multi-link HTML sample
- Words only in the deuterocanon
  Synthetic fixture using `baggage` and `authors`
- Other cases
  Synthetic fixture for `<br>` handling and smart apostrophes like `Judas’` and `isn’t`

## Harness

Run the harness with:

```bash
npm test
```

What it checks:

- oEmbed-style HTML is reduced to extracted tweet text in a stable way
- links and inline media collapse to `[...]` and do not create Bible tokens
- Unicode normalization removes accents and folds curly apostrophes
- repeated words are counted per occurrence
- source-specific matches differ between `kjv` and `kjv-apocrypha` for deuterocanon-only words
