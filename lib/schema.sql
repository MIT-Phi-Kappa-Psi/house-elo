-- house_elo schema.
--
-- Source of truth: games, players, matches, match_teams, match_players.
-- Derived (safe to drop and rebuild at any time): ratings, rating_history.

create extension if not exists pgcrypto;

create table if not exists games (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  -- Team size is a per-game constraint, expressed as a range so a 3v2 caused by
  -- a no-show is still recordable.
  min_team_size int  not null default 1,
  max_team_size int  not null default 1,
  teams_per_match int not null default 2,
  allows_draws  boolean not null default false,
  created_at    timestamptz not null default now(),
  constraint team_size_range check (min_team_size >= 1 and max_team_size >= min_team_size),
  constraint teams_per_match_min check (teams_per_match >= 2)
);

create table if not exists players (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists matches (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references games(id) on delete cascade,
  played_at  timestamptz not null default now(),
  note       text,
  -- Voiding rather than deleting keeps the log append-only; the replay filters
  -- voided rows out.
  voided     boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists matches_game_played_idx on matches (game_id, played_at, id);

create table if not exists match_teams (
  match_id   uuid not null references matches(id) on delete cascade,
  team_index int  not null,
  -- 1-based placement. Equal ranks across teams express a draw, which also
  -- makes free-for-alls and 3+ team matches fall out for free.
  rank       int  not null,
  score      int,
  primary key (match_id, team_index),
  constraint rank_positive check (rank >= 1)
);

create table if not exists match_players (
  match_id   uuid not null references matches(id) on delete cascade,
  team_index int  not null,
  player_id  uuid not null references players(id) on delete restrict,
  primary key (match_id, player_id),
  foreign key (match_id, team_index) references match_teams (match_id, team_index) on delete cascade
);
create index if not exists match_players_player_idx on match_players (player_id);

-- ---------------------------------------------------------------------------
-- Derived tables. Rebuilt wholesale by replaying the match log.
-- ---------------------------------------------------------------------------

create table if not exists ratings (
  game_id        uuid not null references games(id) on delete cascade,
  player_id      uuid not null references players(id) on delete cascade,
  mu             double precision not null,
  sigma          double precision not null,
  matches_played int not null default 0,
  wins           int not null default 0,
  losses         int not null default 0,
  draws          int not null default 0,
  updated_at     timestamptz not null default now(),
  primary key (game_id, player_id)
);

create table if not exists rating_history (
  game_id   uuid not null references games(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  match_id  uuid not null references matches(id) on delete cascade,
  played_at timestamptz not null,
  seq       int not null,
  mu        double precision not null,
  sigma     double precision not null,
  delta     int not null,
  outcome   text not null,
  primary key (match_id, player_id)
);
create index if not exists rating_history_player_idx
  on rating_history (game_id, player_id, seq);
