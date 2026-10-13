/**
 * Row types for every table in supabase/schema.sql.
 *
 * Money columns are `numeric(14,2)` in Postgres and arrive as JS `number`.
 * That is exact well past any household's needs.
 *
 * Months are text `'YYYY-MM'`, which sorts correctly as a string and needs no
 * date arithmetic.
 */

export type UUID = string;

/** `'YYYY-MM'` */
export type MonthString = string;
/** `'YYYY-MM-DD'` */
export type DateString = string;

/** `'owner'` is the Head of the House — exactly one per household. */
export type HouseholdRole = 'owner' | 'member';

export type Household = {
  id: UUID;
  name: string;
  invite_code: string;
  /** Null when the creator's login was deleted; headship lives on the role. */
  created_by: UUID | null;
  created_at: string;
};

export type Profile = {
  id: UUID;
  display_name: string;
  email: string | null;
  avatar_index: number;
  /** Public URL of the uploaded photo. Null means "use the coloured initials". */
  avatar_url: string | null;
  /** Phone dialled on SOS (tel: link to the head). Null = not set yet. */
  phone: string | null;
  /** True once the person has chosen their own name. See schema.sql. */
  is_set_up: boolean;
  created_at: string;
};

export type HouseholdMember = {
  household_id: UUID;
  user_id: UUID;
  role: HouseholdRole;
  joined_at: string;
};

export type Grocery = {
  id: UUID;
  household_id: UUID;
  name: string;
  category: string;
  quantity: number | null;
  unit: string | null;
  is_permanent: boolean;
  is_bought: boolean;
  month: MonthString;
  added_by: UUID;
  bought_by: UUID | null;
  bought_at: string | null;
  created_at: string;
};

/** A grocery joined with who added and who bought it, for attribution in the UI. */
export type GroceryWithPeople = Grocery & {
  added_by_profile: Profile | null;
  bought_by_profile: Profile | null;
};

export const GROCERY_CATEGORIES = [
  'Produce',
  'Dairy',
  'Bakery',
  'Meat',
  'Frozen',
  'Pantry',
  'Household',
  'Other',
] as const;
export type GroceryCategory = (typeof GROCERY_CATEGORIES)[number];

export type HouseExpenseCategory =
  'rent' | 'electricity' | 'water' | 'gas' | 'internet' | 'maid' | 'maintenance' | 'other';

export const HOUSE_EXPENSE_CATEGORIES: readonly HouseExpenseCategory[] = [
  'rent',
  'electricity',
  'water',
  'gas',
  'internet',
  'maid',
  'maintenance',
  'other',
] as const;

export type HouseExpense = {
  id: UUID;
  household_id: UUID;
  category: HouseExpenseCategory;
  label: string;
  amount: number;
  month: MonthString;
  due_day: number | null;
  paid_by: UUID | null;
  is_paid: boolean;
  paid_at: string | null;
  created_at: string;
};

/**
 * Earnings are readable only by their owner — enforced by RLS, not by the UI.
 * Never write a query here that filters on another user's id; the database will
 * refuse it and the query is wrong anyway.
 */
export type Earning = {
  id: UUID;
  household_id: UUID;
  user_id: UUID;
  month: MonthString;
  amount: number;
  source: string;
  note: string | null;
  created_at: string;
};

export const EARNING_SOURCES = [
  'Salary',
  'Freelance',
  'Business',
  'Interest',
  'Gift',
  'Other',
] as const;
export type EarningSource = (typeof EARNING_SOURCES)[number];

/** Savings rows are private per member. The shared figure comes from an RPC. */
export type Saving = {
  id: UUID;
  household_id: UUID;
  user_id: UUID;
  month: MonthString;
  amount: number;
  note: string | null;
  created_at: string;
};

/**
 * Saved family pins (Home, School, …). Shared with the whole household by
 * design — see the `places_rw` policy.
 */
export type Place = {
  id: UUID;
  household_id: UUID;
  name: string;
  note: string | null;
  lat: number;
  lng: number;
  created_by: UUID;
  created_at: string;
};

/**
 * One live row per member. Sharing is opt-in: no row means "not sharing".
 * Any household member may read it; only the owner may write or delete it.
 */
export type MemberLocation = {
  user_id: UUID;
  household_id: UUID;
  lat: number;
  lng: number;
  /** 0-100, null when the sender's app predates battery reporting. */
  battery_level: number | null;
  updated_at: string;
};

/**
 * Household-visible distress flag. The newest `is_active` row is the banner
 * every member sees; resolving flips it off. The phone call itself is a
 * tel: link — this row is the shared signal for members who missed it.
 */
export type SosAlert = {
  id: UUID;
  household_id: UUID;
  triggered_by: UUID;
  message: string | null;
  is_active: boolean;
  created_at: string;
};

export type TaskCadence = 'once' | 'daily' | 'weekly';

export type Task = {
  id: UUID;
  household_id: UUID;
  title: string;
  cadence: TaskCadence;
  is_permanent: boolean;
  assignee_id: UUID | null;
  assigned_by: UUID;
  sort_order: number;
  /** ISO timestamp of the deadline. Null means none — no ping. */
  due_at: string | null;
  created_at: string;
};

export type TaskWithPeople = Task & {
  assignee: Profile | null;
  assigned_by_profile: Profile | null;
};

/**
 * One row per person per day per task. This is why a daily task completed
 * yesterday stays completed yesterday instead of resetting.
 */
export type TaskCompletion = {
  id: UUID;
  task_id: UUID;
  user_id: UUID;
  completed_on: DateString;
  created_at: string;
};

export type Goal = {
  id: UUID;
  household_id: UUID;
  created_by: UUID;
  title: string;
  description: string | null;
  month: MonthString;
  is_done: boolean;
  done_at: string | null;
  created_at: string;
};

export type GoalWithAuthor = Goal & {
  created_by_profile: Profile | null;
};

/** Shapes the UI needs on every screen. */
export type Member = {
  user_id: UUID;
  role: HouseholdRole;
  joined_at: string;
  profile: Profile | null;
};
