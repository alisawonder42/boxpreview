# The box — portfolio page

Files to drop into [alisawonder42/portfolio](https://github.com/alisawonder42/portfolio).
This agent could not push to that repo (403). Apply from a local checkout:

```bash
# from this boxpreview repo
./inject/portfolio/apply.sh /path/to/portfolio
```

That copies the page sources, builds this viewer, and writes it to
`portfolio/public/box/`. Then open a PR on portfolio from
`cursor/flat-the-box-1d74` (the apply script will create the branch if needed).

Result:

- Listed under **FLAT** on the project index
- Page at `/projects/flat/the-box`
- Short copy + full-width embed (`/box/index.html?embed=1`)
