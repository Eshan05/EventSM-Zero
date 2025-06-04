import { useMemo } from "react"
import debounce from "lodash.debounce"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useDebounce<T extends (...args: any[]) => void>(
  fn: T,
  ms: number,
  maxWait?: number
) {
  return useMemo(() => debounce(fn, ms, { maxWait }), [fn, ms, maxWait])
}
