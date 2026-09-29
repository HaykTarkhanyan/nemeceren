/** Per-request values shared between middleware and handlers. */
export type AppEnv = {
  Variables: {
    requestId: string
    /** Set by requireUser: the Neon Auth user id (JWT "sub"). */
    userId: string
    /** Set when an error response is sent, for the request log line. */
    errorCode: string
  }
}
