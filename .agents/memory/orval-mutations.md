---
name: Orval mutation call signatures
description: How to call Orval-generated mutation hooks and query hooks with options in this repo
---

## Rule
Generated mutation hooks wrap arguments — never pass the body or id directly.

- **Create / update** → `mutate({ data: inputBody })`
- **Delete / complete / approve / reject** (single resource) → `mutate({ id: number })`
- **Nested mutations** (list items, routine items) → `mutate({ parentId: number, data: body })` or `mutate({ parentId: number, childId: number })`
- **Verify PIN** → `mutate({ data: { pin } })`

## Query options with `enabled`
When passing `enabled` to a query hook, TypeScript requires `queryKey` as well:
```ts
useGetRoutine(id ?? 0, {
  query: { enabled: id !== null, queryKey: getGetRoutineQueryKey(id ?? 0) }
})
```

**Why:** Orval generates `UseMutationOptions<Result, Error, {data: BodyType<Input>}>` — the variable type is the whole wrapper object, not the inner body. Same pattern applies to all generated hooks.

**How to apply:** Any time you call `.mutate(...)` or pass query options, check the generated `UseMutationResult` generic's third type param to confirm the expected argument shape.
