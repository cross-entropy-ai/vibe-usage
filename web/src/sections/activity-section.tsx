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
      {(summary || activity?.weekday) && (
        <div className="grid gap-4 xl:grid-cols-2">
          {summary && <ActivityHeatmap daily={summary.daily} />}
          {activity?.weekday && <WeekdayHeatmap data={activity.weekday} />}
        </div>
      )}
      {activity?.sessionComplexity && <SessionComplexity data={activity.sessionComplexity} />}
      {activity?.conversations && <ConversationDepth data={activity.conversations} />}
    </>
  );
}
