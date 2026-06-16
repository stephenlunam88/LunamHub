-- LunamHub database schema
-- Auto-generated from lib/db/src/schema/index.ts
-- Mounted into /docker-entrypoint-initdb.d/ — runs only on a fresh (empty) data volume.

-- ── Enums ─────────────────────────────────────────────────────────────────────

CREATE TYPE role AS ENUM ('parent', 'child');
CREATE TYPE repeat_type AS ENUM ('once', 'daily', 'weekly');
CREATE TYPE chore_status AS ENUM ('pending', 'completed', 'approved', 'missed');
CREATE TYPE chore_instance_status AS ENUM ('todo', 'pending_approval', 'done', 'missed', 'rejected');
CREATE TYPE event_category AS ENUM ('school', 'sport', 'appointment', 'birthday', 'family', 'other');
CREATE TYPE redemption_status AS ENUM ('pending', 'approved', 'rejected', 'fulfilled');
CREATE TYPE list_category AS ENUM ('grocery', 'packing', 'school', 'reminders', 'other');
CREATE TYPE meal_type AS ENUM ('breakfast', 'lunch', 'dinner', 'snack');
CREATE TYPE time_of_day AS ENUM ('morning', 'afternoon', 'evening', 'bedtime');
CREATE TYPE transaction_type AS ENUM ('chore_earned', 'reward_spent', 'bonus', 'adjustment');
CREATE TYPE badge_tier AS ENUM ('bronze', 'silver', 'gold');

-- ── Family Members ────────────────────────────────────────────────────────────

CREATE TABLE family_members (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '😊',
    color TEXT NOT NULL DEFAULT '#4f46e5',
    role role NOT NULL DEFAULT 'child',
    points_balance INTEGER NOT NULL DEFAULT 0,
    lifetime_points INTEGER NOT NULL DEFAULT 0,
    avatar_url TEXT,
    pin_hash TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Events ────────────────────────────────────────────────────────────────────

CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    location TEXT,
    date TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    all_day BOOLEAN NOT NULL DEFAULT FALSE,
    category event_category NOT NULL DEFAULT 'other',
    recurrence TEXT,
    recurrence_end_date TEXT,
    google_event_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE event_members (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    member_id INTEGER NOT NULL REFERENCES family_members(id) ON DELETE CASCADE
);

-- ── Chores (legacy — kept for point_transactions FK) ─────────────────────────

CREATE TABLE chores (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    assigned_to INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
    due_date TEXT,
    repeat_type repeat_type NOT NULL DEFAULT 'once',
    points_value INTEGER NOT NULL DEFAULT 10,
    status chore_status NOT NULL DEFAULT 'pending',
    completed_at TIMESTAMP,
    approved_at TIMESTAMP,
    approved_by_parent_id INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Chore Templates ───────────────────────────────────────────────────────────

CREATE TABLE chore_templates (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    points_value INTEGER NOT NULL DEFAULT 10,
    repeat_type repeat_type NOT NULL DEFAULT 'once',
    days_of_week TEXT,
    requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
    legacy_chore_id INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE chore_template_children (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES chore_templates(id) ON DELETE CASCADE,
    child_id INTEGER NOT NULL REFERENCES family_members(id) ON DELETE CASCADE
);

-- ── Chore Instances ───────────────────────────────────────────────────────────

CREATE TABLE chore_instances (
    id SERIAL PRIMARY KEY,
    template_id INTEGER REFERENCES chore_templates(id) ON DELETE CASCADE,
    child_id INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    points_value INTEGER NOT NULL DEFAULT 10,
    repeat_type repeat_type NOT NULL DEFAULT 'once',
    due_date TEXT NOT NULL,
    status chore_instance_status NOT NULL DEFAULT 'todo',
    points_awarded BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMP,
    approved_at TIMESTAMP,
    approved_by_parent_id INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
    missed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_chore_instance_per_day UNIQUE (template_id, child_id, due_date)
);

-- ── Rewards ───────────────────────────────────────────────────────────────────

CREATE TABLE rewards (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    points_cost INTEGER NOT NULL DEFAULT 100,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE reward_redemptions (
    id SERIAL PRIMARY KEY,
    reward_id INTEGER NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
    member_id INTEGER NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
    points_cost INTEGER NOT NULL DEFAULT 0,
    status redemption_status NOT NULL DEFAULT 'pending',
    approved_by_parent_id INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
    approved_at TIMESTAMP,
    fulfilled_by_parent_id INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
    fulfilled_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Point Transactions ────────────────────────────────────────────────────────

CREATE TABLE point_transactions (
    id SERIAL PRIMARY KEY,
    member_id INTEGER NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    type transaction_type NOT NULL,
    description TEXT NOT NULL,
    chore_id INTEGER REFERENCES chores(id) ON DELETE SET NULL,
    chore_instance_id INTEGER REFERENCES chore_instances(id) ON DELETE SET NULL,
    redemption_id INTEGER REFERENCES reward_redemptions(id) ON DELETE SET NULL,
    approved_by_parent_id INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Badges ────────────────────────────────────────────────────────────────────

CREATE TABLE badges (
    id SERIAL PRIMARY KEY,
    member_id INTEGER NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    emoji TEXT NOT NULL DEFAULT '🏆',
    tier badge_tier NOT NULL DEFAULT 'bronze',
    awarded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Milestones ────────────────────────────────────────────────────────────────

CREATE TABLE streak_milestones (
    id SERIAL PRIMARY KEY,
    days INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    emoji TEXT NOT NULL DEFAULT '🔥',
    tier badge_tier NOT NULL DEFAULT 'bronze',
    bonus_points INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE point_milestones (
    id SERIAL PRIMARY KEY,
    threshold INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    emoji TEXT NOT NULL DEFAULT '⭐',
    tier badge_tier NOT NULL DEFAULT 'bronze',
    bonus_points INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE chore_milestones (
    id SERIAL PRIMARY KEY,
    threshold INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    emoji TEXT NOT NULL DEFAULT '🎯',
    tier badge_tier NOT NULL DEFAULT 'bronze',
    bonus_points INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

-- ── Lists ─────────────────────────────────────────────────────────────────────

CREATE TABLE lists (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    category list_category NOT NULL DEFAULT 'other',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE list_items (
    id SERIAL PRIMARY KEY,
    list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    assigned_to INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
    category TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Meals ─────────────────────────────────────────────────────────────────────

CREATE TABLE meals (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    notes TEXT,
    ingredients TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE meal_plan (
    id SERIAL PRIMARY KEY,
    meal_id INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    meal_type meal_type NOT NULL DEFAULT 'dinner'
);

-- ── Routines ──────────────────────────────────────────────────────────────────

CREATE TABLE routines (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    assigned_to INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
    time_of_day time_of_day NOT NULL DEFAULT 'morning',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE routine_items (
    id SERIAL PRIMARY KEY,
    routine_id INTEGER NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE routine_completions (
    id SERIAL PRIMARY KEY,
    routine_id INTEGER NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    routine_item_id INTEGER NOT NULL REFERENCES routine_items(id) ON DELETE CASCADE,
    completed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Settings ──────────────────────────────────────────────────────────────────

CREATE TABLE settings (
    id SERIAL PRIMARY KEY,
    parent_pin TEXT NOT NULL DEFAULT '1234',
    app_name TEXT NOT NULL DEFAULT 'LunamHub',
    timezone TEXT NOT NULL DEFAULT 'UTC',
    display_mode BOOLEAN NOT NULL DEFAULT FALSE,
    google_calendar_connection_id TEXT,
    google_refresh_token TEXT,
    weather_city TEXT,
    screensaver_timeout INTEGER NOT NULL DEFAULT 5,
    screensaver_photo_interval INTEGER NOT NULL DEFAULT 15
);

-- Seed the single settings row
INSERT INTO settings DEFAULT VALUES;

-- ── Screensaver Photos ────────────────────────────────────────────────────────

CREATE TABLE screensaver_photos (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL,
    filename TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
