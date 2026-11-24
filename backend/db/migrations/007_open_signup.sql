-- Open sign-up with Google (DECISIONS.md #118). Anyone signed in gets their own progress.
-- allowed_users keeps Hayk and the friends: they have no usage limits. Everyone else is counted here per day, so that
-- strangers cannot use up the free compute (100 CU-hours a month). A "window" is a 5-minute slot with at least one
-- request. Rows are removed after 7 days (src/usage.ts).

COMMENT ON TABLE allowed_users IS 'Trusted learners: no usage or row limits (DECISIONS.md #118). Until then: who may use the API at all (#52).';

CREATE TABLE api_usage (
  user_id     text    NOT NULL,
  day         date    NOT NULL,
  requests    integer NOT NULL CHECK (requests >= 0),
  windows     integer NOT NULL CHECK (windows >= 0),
  last_window integer NOT NULL,
  PRIMARY KEY (user_id, day)
);

-- Windows of all accounts outside allowed_users together.
CREATE TABLE api_usage_total (
  day         date    PRIMARY KEY,
  windows     integer NOT NULL CHECK (windows >= 0),
  last_window integer NOT NULL
);
