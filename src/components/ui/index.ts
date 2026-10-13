/**
 * The Home Os UI kit.
 *
 * Feature code imports from this barrel and from nothing else in
 * `src/components`. That restriction is deliberate: it keeps sub-agents 2, 3 and
 * 4 from inventing near-duplicate buttons and rows in three different folders,
 * and it means a fix to a touch target lands everywhere at once.
 *
 * Rules live in DESIGN.md. The short version: no raw colour, radius or spacing
 * values outside `src/theme/tokens.ts`; no emoji as icons; nothing smaller than
 * 48dp; never disable font scaling.
 */

export { Button, CircleButton, type ButtonSize, type ButtonVariant } from '@/components/ui/Button';
export { Chip, Fab, Icon, successFeedback, tapFeedback, UndoToast } from '@/components/ui/Feedback';
export { IconButton, Input, SearchInput } from '@/components/ui/Input';
export { Card, ListSection, Row, ScreenHeader, SectionHeader } from '@/components/ui/Layout';
export { MoneyText } from '@/components/ui/MoneyText';
export { Screen, Stack, usePageTop } from '@/components/ui/Screen';
export { LabeledSwitch } from '@/components/ui/Switch';
export { AppTabBar } from '@/components/ui/TabBar';
export { ConfirmDialog, Sheet } from '@/components/ui/Sheet';
export { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
export { HomeSkeleton, SkeletonBlock, useShimmerProgress } from '@/components/ui/Skeleton';
export { Text, type TextTone, type TextVariant } from '@/components/ui/Text';
export { Avatar, Badge, initialsOf, ProgressBar } from '@/components/ui/Display';
export { CheckBox, Collapsible, SegmentedControl, Stepper } from '@/components/ui/Controls';
