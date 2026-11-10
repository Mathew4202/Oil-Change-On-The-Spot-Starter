-- "Same filter, different number": a Parts Source (or any brand) part number that is the same part as one
-- our cars use (like NAPA 27356). Receipts and Stock put it under the number the cars use.
create table if not exists part_aliases (
  alias        text primary key,           -- the other number, cleaned (no spaces, dashes or store prefix)
  part_number  text not null,              -- the number our cars use
  created_by   text,
  created_at   timestamptz not null default now()
);
