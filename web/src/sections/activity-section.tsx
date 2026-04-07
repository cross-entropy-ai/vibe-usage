import { useSummary, useActivity } from "@/lib/contexts";
import { Languages } from "@/components/languages";
import { ActivityHeatmap } from "@/components/activity-heatmap";
import { WeekdayHeatmap } from "@/components/weekday-heatmap";
import { SessionComplexity } from "@/components/session-complexity";
import { ConversationDepth } from "@/components/conversation-depth";

export function ActivitySection() {
  const summary = useSummary();
  const activity = useActivity();

  return (
    <>
      {activity?.languages && <Languages data={activity.languages} />}
      {summary && <ActivityHeatmap daily={summary.daily} />}
      {(activity?.weekday || activity?.sessionComplexity) && (
        <div className="grid gap-4 xl:grid-cols-2">
          {activity?.weekday && <WeekdayHeatmap data={activity.weekday} />}
          {activity?.sessionComplexity && <SessionComplexity data={activity.sessionComplexity} />}
        </div>
      )}
      {activity?.conversations && <ConversationDepth data={activity.conversations} />}
    </>
  );
}
