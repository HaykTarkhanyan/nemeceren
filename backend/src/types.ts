/** Per-request values shared between middleware and handlers. */
export type AppEnv = {
  Variables: {
    requestId: string
    /** Set by requireUser: the Neon Auth user id (JWT "sub"). */
    userId: string
    /** Set by requireUser: the account is in allowed_users (Hayk and the friends), so no usage or row limits (DECISIONS.md #118). */
    trusted: boolean
    /** Set when an error response is sent, for the request log line. */
    errorCode: string
  }
}
