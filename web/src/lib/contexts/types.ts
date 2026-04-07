import type {
  LanguagesData,
  WeekdayHeatmapEntry,
  SessionComplexityEntry,
  ConversationsInsight,
  TokensDailyEntry,
  CacheEfficiencyData,
  ThinkingEntry,
  DurationData,
  ModelTokens,
  ToolCallFreq,
  ToolStatusEntry,
  ToolchainsData,
  ModelSwitchData,
  ProjectDetail,
  HostStat,
  GitRepoStat,
  DirectoryStat,
} from "@/types";

export interface ActivityContextValue {
  languages: LanguagesData | null;
  weekday: WeekdayHeatmapEntry[] | null;
  sessionComplexity: SessionComplexityEntry[] | null;
  conversations: ConversationsInsight | null;
}

export interface TokenContextValue {
  tokensDaily: TokensDailyEntry[] | null;
  cacheEfficiency: CacheEfficiencyData | null;
  thinking: ThinkingEntry[] | null;
}

export interface ModelsToolsContextValue {
  duration: DurationData | null;
  models: ModelTokens[] | null;
  toolCalls: ToolCallFreq[] | null;
  toolStatus: ToolStatusEntry[] | null;
  toolchains: ToolchainsData | null;
  modelSwitches: ModelSwitchData | null;
}

export interface TablesContextValue {
  projects: ProjectDetail[] | null;
  hosts: HostStat[] | null;
  gitActivity: GitRepoStat[] | null;
  directories: DirectoryStat[] | null;
}
