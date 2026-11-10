-- "Same filter, different number": a Parts Source (or any brand) part number that is the same part as one
-- our cars use (like NAPA 27356). Each keeps its own count in Stock; the Bring list says "27356 or <other #>"
-- and counts both.
create table if not exists part_aliases (
  alias        text primary key,           -- the other number, as on the receipt
  part_number  text not null,              -- the number our cars use
  created_by   text,
  created_at   timestamptz not null default now()
);
