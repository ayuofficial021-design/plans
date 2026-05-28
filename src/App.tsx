import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { createClient, type User } from "@supabase/supabase-js";
import {
  BarChart3,
  Bell,
  CalendarDays,
  CalendarRange,
  ChartGantt,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CloudSun,
  Download,
  LayoutDashboard,
  ListTodo,
  Plus,
  RefreshCw,
  Search,
  Target,
  Trash2,
  Upload,
  X,
} from "lucide-react";

type RepeatRule = "none" | "daily" | "weekly" | "monthly" | "yearly";
type ReminderMinutes = number | null;
type AppView = "calendar" | "dashboard" | "plans";
type CalendarPickerMode = "days" | "months" | "years";
type PlanLevel = "year" | "month" | "week";
type PlanStatus = "todo" | "doing" | "done";
type PlanTaskStatus = "todo" | "scheduled" | "done";
type WeatherStatus = "idle" | "loading" | "ready" | "error";
type CloudStatus = "idle" | "loading" | "ready" | "error";

type CalendarCategory = {
  id: string;
  name: string;
  color: string;
};

type WeatherInfo = {
  status: WeatherStatus;
  locationLabel: string;
  temperature: number | null;
  apparentTemperature: number | null;
  high: number | null;
  low: number | null;
  precipitationProbability: number | null;
  windSpeed: number | null;
  condition: string;
  updatedAt: string | null;
  isFallbackLocation: boolean;
};

type CloudSnapshot = {
  events: CalendarEvent[];
  plans: PlanItem[];
  updatedAt: string;
};

type CloudSyncState = {
  status: CloudStatus;
  message: string;
  cloudUpdatedAt: string | null;
  localUpdatedAt: string | null;
};

type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  time: string | null;
  allDay: boolean;
  notes: string;
  calendarId: string;
  repeatRule: RepeatRule;
  repeatUntil?: string;
  reminderMinutes: ReminderMinutes;
  planId?: string;
  planTaskId?: string;
  createdAt: number;
  updatedAt?: number;
};

type EventDraft = {
  title: string;
  date: string;
  time: string;
  allDay: boolean;
  notes: string;
  calendarId: string;
  repeatRule: RepeatRule;
  repeatUntil: string;
  reminderMinutes: ReminderMinutes;
  planId?: string;
  planTaskId?: string;
};

type CalendarCell = {
  date: Date;
  dateStr: string;
  isOtherMonth: boolean;
  lunar: string;
};

type Occurrence = {
  event: CalendarEvent;
  occurrenceDate: string;
  occurrenceKey: string;
};

type PlanTask = {
  id: string;
  title: string;
  notes: string;
  status: PlanTaskStatus;
  scheduledEventId?: string;
  scheduledDate?: string;
  scheduledTime?: string | null;
  createdAt: number;
  updatedAt?: number;
};

type PlanItem = {
  id: string;
  title: string;
  level: PlanLevel;
  parentPlanId?: string;
  startDate: string;
  endDate: string;
  goal: string;
  deliverable: string;
  notes: string;
  status: PlanStatus;
  progress: number;
  timeProgressOverride?: number;
  tasks: PlanTask[];
  createdAt: number;
  updatedAt?: number;
};

type PlanDraft = {
  title: string;
  level: PlanLevel;
  parentPlanId?: string;
  startDate: string;
  endDate: string;
  goal: string;
  deliverable: string;
  notes: string;
  status: PlanStatus;
  progress: number;
  timeProgressOverride?: number;
  tasks: PlanTask[];
};

type ScheduleTaskDraft = {
  planId: string;
  taskId: string;
  title: string;
  date: string;
  time: string;
  allDay: boolean;
  calendarId: string;
  reminderMinutes: ReminderMinutes;
};

const eventsStorageKey = "calendar_events";
const plansStorageKey = "calendar_plans_v1";
const remindedStorageKey = "calendar_reminded_keys_v1";
const cloudLocalUpdatedKey = "calendar_cloud_local_updated_at";
const cloudSnapshotTable = "calendar_snapshots";
const dayMs = 24 * 60 * 60 * 1000;
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;
const fallbackWeatherLocation = {
  latitude: 31.2304,
  longitude: 121.4737,
  label: "上海",
};
const initialWeatherInfo: WeatherInfo = {
  status: "idle",
  locationLabel: "定位中",
  temperature: null,
  apparentTemperature: null,
  high: null,
  low: null,
  precipitationProbability: null,
  windSpeed: null,
  condition: "获取天气",
  updatedAt: null,
  isFallbackLocation: false,
};

const categories: CalendarCategory[] = [
  { id: "personal", name: "个人", color: "#007aff" },
  { id: "work", name: "工作", color: "#ff9500" },
  { id: "family", name: "家庭", color: "#34c759" },
  { id: "important", name: "重要", color: "#ff3b30" },
  { id: "study", name: "学习", color: "#5856d6" },
  { id: "other", name: "其他", color: "#8e8e93" },
];

const repeatOptions: Array<{ value: RepeatRule; label: string }> = [
  { value: "none", label: "不重复" },
  { value: "daily", label: "每天" },
  { value: "weekly", label: "每周" },
  { value: "monthly", label: "每月" },
  { value: "yearly", label: "每年" },
];

const reminderOptions: Array<{ value: ReminderMinutes; label: string }> = [
  { value: null, label: "不提醒" },
  { value: 0, label: "事件开始时" },
  { value: 5, label: "提前 5 分钟" },
  { value: 15, label: "提前 15 分钟" },
  { value: 30, label: "提前 30 分钟" },
  { value: 60, label: "提前 1 小时" },
  { value: 1440, label: "提前 1 天" },
];

const planLevelOptions: Array<{ value: PlanLevel; label: string }> = [
  { value: "year", label: "年计划" },
  { value: "month", label: "月计划" },
  { value: "week", label: "周计划" },
];

const planStatusOptions: Array<{ value: PlanStatus; label: string }> = [
  { value: "todo", label: "未开始" },
  { value: "doing", label: "进行中" },
  { value: "done", label: "已完成" },
];

const planTaskStatusOptions: Array<{ value: PlanTaskStatus; label: string }> = [
  { value: "todo", label: "待安排" },
  { value: "scheduled", label: "已安排" },
  { value: "done", label: "已完成" },
];

let lunarFormatter: Intl.DateTimeFormat | null = null;

try {
  lunarFormatter = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
    month: "short",
    day: "numeric",
  });
} catch {
  lunarFormatter = null;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function getDateStr(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseDateStr(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMinutes(date: Date, amount: number) {
  return new Date(date.getTime() + amount * 60 * 1000);
}

function getUtcDay(dateStr: string) {
  const date = parseDateStr(dateStr);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(dateStr: string, startDateStr: string) {
  return Math.round((getUtcDay(dateStr) - getUtcDay(startDateStr)) / dayMs);
}

function generateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function isValidDateStr(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = parseDateStr(value);
  return !Number.isNaN(date.getTime()) && getDateStr(date) === value;
}

function isValidTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

function normalizeRepeat(value: unknown): RepeatRule {
  return repeatOptions.some((option) => option.value === value) ? (value as RepeatRule) : "none";
}

function normalizeEvent(raw: unknown): CalendarEvent | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  if (typeof record.title !== "string" || !record.title.trim() || !isValidDateStr(record.date)) {
    return null;
  }

  const repeatRule = normalizeRepeat(record.repeatRule);
  const rawTime = isValidTime(record.time) ? record.time : null;
  const allDay = typeof record.allDay === "boolean" ? record.allDay : rawTime === null;
  const reminderMinutes =
    typeof record.reminderMinutes === "number" && Number.isFinite(record.reminderMinutes)
      ? Math.max(0, Math.round(record.reminderMinutes))
      : null;
  const repeatUntil = repeatRule !== "none" && isValidDateStr(record.repeatUntil) ? record.repeatUntil : undefined;
  const calendarId =
    typeof record.calendarId === "string" && categories.some((category) => category.id === record.calendarId)
      ? record.calendarId
      : categories[0].id;

  return {
    id: typeof record.id === "string" && record.id ? record.id : generateId(),
    title: record.title.trim(),
    date: record.date,
    time: allDay ? null : rawTime ?? "09:00",
    allDay,
    notes: typeof record.notes === "string" ? record.notes : "",
    calendarId,
    repeatRule,
    repeatUntil,
    reminderMinutes,
    planId: typeof record.planId === "string" ? record.planId : undefined,
    planTaskId: typeof record.planTaskId === "string" ? record.planTaskId : undefined,
    createdAt: typeof record.createdAt === "number" ? record.createdAt : Date.now(),
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : undefined,
  };
}

function normalizePlanTask(raw: unknown): PlanTask | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  if (typeof record.title !== "string" || !record.title.trim()) {
    return null;
  }

  const status = planTaskStatusOptions.some((option) => option.value === record.status)
    ? (record.status as PlanTaskStatus)
    : typeof record.scheduledEventId === "string"
      ? "scheduled"
      : "todo";

  return {
    id: typeof record.id === "string" && record.id ? record.id : generateId(),
    title: record.title.trim(),
    notes: typeof record.notes === "string" ? record.notes : "",
    status,
    scheduledEventId: typeof record.scheduledEventId === "string" ? record.scheduledEventId : undefined,
    scheduledDate: isValidDateStr(record.scheduledDate) ? record.scheduledDate : undefined,
    scheduledTime: isValidTime(record.scheduledTime) ? record.scheduledTime : record.scheduledTime === null ? null : undefined,
    createdAt: typeof record.createdAt === "number" ? record.createdAt : Date.now(),
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : undefined,
  };
}

function normalizePlan(raw: unknown): PlanItem | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  if (typeof record.title !== "string" || !record.title.trim()) {
    return null;
  }

  const level = planLevelOptions.some((option) => option.value === record.level) ? (record.level as PlanLevel) : "month";
  const status = planStatusOptions.some((option) => option.value === record.status) ? (record.status as PlanStatus) : "todo";
  const startDate = isValidDateStr(record.startDate) ? record.startDate : getDateStr(new Date());
  const rawEndDate = isValidDateStr(record.endDate) ? record.endDate : startDate;
  const endDate = rawEndDate < startDate ? startDate : rawEndDate;
  const progress =
    typeof record.progress === "number" && Number.isFinite(record.progress)
      ? Math.min(100, Math.max(0, Math.round(record.progress)))
      : status === "done"
        ? 100
        : 0;
  const timeProgressOverride =
    typeof record.timeProgressOverride === "number" && Number.isFinite(record.timeProgressOverride)
      ? Math.min(100, Math.max(0, Math.round(record.timeProgressOverride)))
      : undefined;
  const normalizedTasks = Array.isArray(record.tasks)
    ? record.tasks.map(normalizePlanTask).filter((task): task is PlanTask => task !== null)
    : [];
  const goal = typeof record.goal === "string" ? record.goal : "";
  const deliverable =
    typeof record.deliverable === "string" && record.deliverable.trim() ? record.deliverable : goal;
  const tasks =
    normalizedTasks.length > 0
      ? normalizedTasks
      : [
          {
            id: generateId(),
            title: typeof record.goal === "string" && record.goal.trim() ? record.goal.trim() : `细化：${record.title.trim()}`,
            notes: "",
            status: "todo" as PlanTaskStatus,
            createdAt: Date.now(),
          },
        ];

  return {
    id: typeof record.id === "string" && record.id ? record.id : generateId(),
    title: record.title.trim(),
    level,
    parentPlanId: typeof record.parentPlanId === "string" && record.parentPlanId ? record.parentPlanId : undefined,
    startDate,
    endDate,
    goal,
    deliverable,
    notes: typeof record.notes === "string" ? record.notes : "",
    status,
    progress: status === "done" ? 100 : progress,
    timeProgressOverride,
    tasks,
    createdAt: typeof record.createdAt === "number" ? record.createdAt : Date.now(),
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : undefined,
  };
}

function containsPlanRange(parent: PlanItem, child: PlanItem) {
  return parent.startDate <= child.startDate && parent.endDate >= child.endDate;
}

function inferParentPlan(plan: PlanItem, plans: PlanItem[]) {
  if (plan.level === "year") {
    return undefined;
  }

  const preferredLevels: PlanLevel[] = plan.level === "week" ? ["month", "year"] : ["year"];
  for (const level of preferredLevels) {
    const parent = plans
      .filter((item) => item.id !== plan.id && item.level === level && containsPlanRange(item, plan))
      .sort((a, b) => {
        const spanA = daysBetween(a.endDate, a.startDate);
        const spanB = daysBetween(b.endDate, b.startDate);
        return spanA - spanB || a.startDate.localeCompare(b.startDate);
      })[0];

    if (parent) {
      return parent;
    }
  }

  return undefined;
}

function connectPlanHierarchy(plans: PlanItem[]) {
  return plans.map((plan) => {
    if (plan.level === "year") {
      return plan.parentPlanId ? { ...plan, parentPlanId: undefined } : plan;
    }

    const currentParent = plan.parentPlanId ? plans.find((item) => item.id === plan.parentPlanId) : undefined;
    if (currentParent && canUseParentPlan(currentParent, plan.level, plan.id)) {
      return plan;
    }

    const inferredParent = inferParentPlan(plan, plans);
    return inferredParent ? { ...plan, parentPlanId: inferredParent.id } : { ...plan, parentPlanId: undefined };
  });
}

function createSampleEvents(today: Date): CalendarEvent[] {
  const todayStr = getDateStr(today);
  const tomorrowStr = getDateStr(addDays(today, 1));
  const thirdDayStr = getDateStr(addDays(today, 3));
  const nextWeekStr = getDateStr(addDays(today, 7));
  const now = Date.now();

  return [
    {
      id: generateId(),
      title: "晨间计划",
      date: todayStr,
      time: "09:00",
      allDay: false,
      notes: "整理今天的三个重点",
      calendarId: "personal",
      repeatRule: "daily",
      repeatUntil: getDateStr(addDays(today, 14)),
      reminderMinutes: 15,
      planId: undefined,
      planTaskId: undefined,
      createdAt: now,
    },
    {
      id: generateId(),
      title: "项目评审",
      date: todayStr,
      time: "14:30",
      allDay: false,
      notes: "带上最新进度",
      calendarId: "work",
      repeatRule: "none",
      reminderMinutes: 30,
      planId: undefined,
      planTaskId: undefined,
      createdAt: now - 1000,
    },
    {
      id: generateId(),
      title: "家庭晚餐",
      date: tomorrowStr,
      time: null,
      allDay: true,
      notes: "提前确认时间",
      calendarId: "family",
      repeatRule: "none",
      reminderMinutes: null,
      planId: undefined,
      planTaskId: undefined,
      createdAt: now - 2000,
    },
    {
      id: generateId(),
      title: "学习复盘",
      date: thirdDayStr,
      time: "20:00",
      allDay: false,
      notes: "复盘本周输入和输出",
      calendarId: "study",
      repeatRule: "weekly",
      repeatUntil: getDateStr(addDays(today, 60)),
      reminderMinutes: 60,
      planId: undefined,
      planTaskId: undefined,
      createdAt: now - 3000,
    },
    {
      id: generateId(),
      title: "账单检查",
      date: nextWeekStr,
      time: null,
      allDay: true,
      notes: "",
      calendarId: "important",
      repeatRule: "monthly",
      reminderMinutes: 1440,
      planId: undefined,
      planTaskId: undefined,
      createdAt: now - 4000,
    },
  ];
}

function createSamplePlans(today: Date): PlanItem[] {
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const yearEnd = new Date(today.getFullYear(), 11, 31);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const weekStart = addDays(today, -today.getDay() + 1);
  const weekEnd = addDays(weekStart, 6);
  const now = Date.now();
  const yearPlanId = generateId();
  const monthPlanId = generateId();
  const weekPlanId = generateId();

  return [
    {
      id: yearPlanId,
      title: "年度成长计划",
      level: "year",
      startDate: getDateStr(yearStart),
      endDate: getDateStr(yearEnd),
      goal: "形成稳定的工作、学习和健康节奏",
      deliverable: "年度成长复盘报告",
      notes: "每季度复盘一次",
      status: "doing",
      progress: 42,
      timeProgressOverride: undefined,
      tasks: [
        {
          id: generateId(),
          title: "完成 Q2 能力盘点",
          notes: "写出本季度要补齐的能力",
          status: "todo",
          createdAt: now - 10,
        },
        {
          id: generateId(),
          title: "建立季度复盘模板",
          notes: "",
          status: "todo",
          createdAt: now - 20,
        },
      ],
      createdAt: now,
    },
    {
      id: monthPlanId,
      title: "本月重点交付",
      level: "month",
      parentPlanId: yearPlanId,
      startDate: getDateStr(monthStart),
      endDate: getDateStr(monthEnd),
      goal: "完成关键项目节点和资料整理",
      deliverable: "项目资料包和阶段交付清单",
      notes: "周末检查风险",
      status: "doing",
      progress: 58,
      timeProgressOverride: undefined,
      tasks: [
        {
          id: generateId(),
          title: "整理项目材料",
          notes: "先列目录，再补缺口",
          status: "todo",
          createdAt: now - 1010,
        },
        {
          id: generateId(),
          title: "安排一次中期检查",
          notes: "",
          status: "todo",
          createdAt: now - 1020,
        },
      ],
      createdAt: now - 1000,
    },
    {
      id: weekPlanId,
      title: "本周行动清单",
      level: "week",
      parentPlanId: monthPlanId,
      startDate: getDateStr(weekStart),
      endDate: getDateStr(weekEnd),
      goal: "推进 3 个高优先级任务",
      deliverable: "本周行动结果与复盘记录",
      notes: "每天结束前更新进度",
      status: "todo",
      progress: 20,
      timeProgressOverride: undefined,
      tasks: [
        {
          id: generateId(),
          title: "拆分本周三件要事",
          notes: "",
          status: "todo",
          createdAt: now - 2010,
        },
      ],
      createdAt: now - 2000,
    },
  ];
}

function loadStoredEvents() {
  try {
    const raw = window.localStorage.getItem(eventsStorageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(normalizeEvent).filter((event): event is CalendarEvent => event !== null);
  } catch {
    return [];
  }
}

function loadInitialEvents() {
  const stored = loadStoredEvents();
  return stored.length > 0 ? stored : createSampleEvents(new Date());
}

function loadStoredPlans() {
  try {
    const raw = window.localStorage.getItem(plansStorageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return connectPlanHierarchy(parsed.map(normalizePlan).filter((plan): plan is PlanItem => plan !== null));
  } catch {
    return [];
  }
}

function loadInitialPlans() {
  const stored = loadStoredPlans();
  return stored.length > 0 ? stored : createSamplePlans(new Date());
}

function getStoredLocalUpdatedAt() {
  try {
    return window.localStorage.getItem(cloudLocalUpdatedKey);
  } catch {
    return null;
  }
}

function setStoredLocalUpdatedAt(value: string) {
  try {
    window.localStorage.setItem(cloudLocalUpdatedKey, value);
  } catch {
    // Local sync metadata is helpful but not critical.
  }
}

function normalizeSnapshotPayload(payload: unknown): CloudSnapshot | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as { events?: unknown; plans?: unknown; updatedAt?: unknown; updated_at?: unknown };
  const events = Array.isArray(record.events)
    ? record.events.map(normalizeEvent).filter((event): event is CalendarEvent => event !== null)
    : [];
  const plans = Array.isArray(record.plans)
    ? connectPlanHierarchy(record.plans.map(normalizePlan).filter((plan): plan is PlanItem => plan !== null))
    : [];

  return {
    events,
    plans,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : typeof record.updated_at === "string" ? record.updated_at : "",
  };
}

function createDraft(date: string, event?: CalendarEvent): EventDraft {
  return {
    title: event?.title ?? "",
    date: event?.date ?? date,
    time: event?.time ?? "09:00",
    allDay: event?.allDay ?? true,
    notes: event?.notes ?? "",
    calendarId: event?.calendarId ?? categories[0].id,
    repeatRule: event?.repeatRule ?? "none",
    repeatUntil: event?.repeatUntil ?? "",
    reminderMinutes: event?.reminderMinutes ?? null,
    planId: event?.planId,
    planTaskId: event?.planTaskId,
  };
}

function createPlanDraft(date: string, plan?: PlanItem): PlanDraft {
  const start = plan?.startDate ?? date;
  return {
    title: plan?.title ?? "",
    level: plan?.level ?? "month",
    parentPlanId: plan?.parentPlanId,
    startDate: start,
    endDate: plan?.endDate ?? start,
    goal: plan?.goal ?? "",
    deliverable: plan?.deliverable ?? "",
    notes: plan?.notes ?? "",
    status: plan?.status ?? "todo",
    progress: plan?.progress ?? 0,
    timeProgressOverride: plan?.timeProgressOverride,
    tasks: plan?.tasks ?? [],
  };
}

function getCategory(calendarId: string) {
  return categories.find((category) => category.id === calendarId) ?? categories[categories.length - 1];
}

function formatLunarDate(date: Date) {
  if (!lunarFormatter) {
    return "";
  }

  try {
    return lunarFormatter.format(date).replace(/\s/g, "");
  } catch {
    return "";
  }
}

function buildCalendarCells(year: number, month: number): CalendarCell[] {
  const firstDay = new Date(year, month, 1);
  const startDayOfWeek = firstDay.getDay();
  const gridStart = addDays(firstDay, -startDayOfWeek);

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    return {
      date,
      dateStr: getDateStr(date),
      isOtherMonth: date.getMonth() !== month,
      lunar: formatLunarDate(date),
    };
  });
}

function occursOn(event: CalendarEvent, dateStr: string) {
  if (dateStr < event.date) {
    return false;
  }

  if (event.repeatUntil && dateStr > event.repeatUntil) {
    return false;
  }

  if (event.repeatRule === "none") {
    return dateStr === event.date;
  }

  const date = parseDateStr(dateStr);
  const start = parseDateStr(event.date);
  const diff = daysBetween(dateStr, event.date);

  if (diff < 0) {
    return false;
  }

  switch (event.repeatRule) {
    case "daily":
      return true;
    case "weekly":
      return diff % 7 === 0;
    case "monthly":
      return date.getDate() === start.getDate();
    case "yearly":
      return date.getMonth() === start.getMonth() && date.getDate() === start.getDate();
    default:
      return false;
  }
}

function sortOccurrences(a: Occurrence, b: Occurrence) {
  if (a.occurrenceDate !== b.occurrenceDate) {
    return a.occurrenceDate.localeCompare(b.occurrenceDate);
  }

  if (a.event.allDay !== b.event.allDay) {
    return a.event.allDay ? -1 : 1;
  }

  const aTime = a.event.time ?? "";
  const bTime = b.event.time ?? "";
  if (aTime !== bTime) {
    return aTime.localeCompare(bTime);
  }

  return a.event.createdAt - b.event.createdAt;
}

function expandOccurrences(events: CalendarEvent[], startDate: string, endDate: string) {
  const result: Occurrence[] = [];
  let cursor = parseDateStr(startDate);
  const end = parseDateStr(endDate);

  while (cursor <= end) {
    const dateStr = getDateStr(cursor);
    events.forEach((event) => {
      if (occursOn(event, dateStr)) {
        result.push({
          event,
          occurrenceDate: dateStr,
          occurrenceKey: `${event.id}:${dateStr}`,
        });
      }
    });
    cursor = addDays(cursor, 1);
  }

  return result.sort(sortOccurrences);
}

function groupOccurrences(occurrences: Occurrence[]) {
  return occurrences.reduce<Record<string, Occurrence[]>>((groups, occurrence) => {
    if (!groups[occurrence.occurrenceDate]) {
      groups[occurrence.occurrenceDate] = [];
    }
    groups[occurrence.occurrenceDate].push(occurrence);
    return groups;
  }, {});
}

function formatPanelDate(dateStr: string) {
  const date = parseDateStr(dateStr);
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
}

function formatFullDate(dateStr: string) {
  const date = parseDateStr(dateStr);
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
}

function formatShortDate(dateStr: string) {
  const date = parseDateStr(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatSyncTime(value: string | null) {
  if (!value) {
    return "暂无";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "暂无";
  }

  return `${date.getMonth() + 1}/${date.getDate()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function formatTime(event: CalendarEvent) {
  return event.allDay ? "全天" : event.time ?? "09:00";
}

function getRepeatLabel(rule: RepeatRule) {
  return repeatOptions.find((option) => option.value === rule)?.label ?? "不重复";
}

function getReminderLabel(value: ReminderMinutes) {
  return reminderOptions.find((option) => option.value === value)?.label ?? "不提醒";
}

function getWeatherCondition(code: number) {
  if (code === 0) return "晴";
  if (code === 1) return "少云";
  if (code === 2) return "多云";
  if (code === 3) return "阴";
  if (code === 45 || code === 48) return "雾";
  if ((code >= 51 && code <= 57) || (code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "雨";
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return "雪";
  if (code >= 95) return "雷雨";
  return "天气";
}

function formatWeatherValue(value: number | null, unit = "°") {
  return value === null || Number.isNaN(value) ? "--" : `${Math.round(value)}${unit}`;
}

function getBrowserPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation unavailable"));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      maximumAge: 30 * 60 * 1000,
      timeout: 5000,
    });
  });
}

function getPlanLevelLabel(level: PlanLevel) {
  return planLevelOptions.find((option) => option.value === level)?.label ?? "月计划";
}

function getPlanStatusLabel(status: PlanStatus) {
  return planStatusOptions.find((option) => option.value === status)?.label ?? "未开始";
}

function getPlanLevelColor(level: PlanLevel) {
  if (level === "year") return "#ff3b30";
  if (level === "month") return "#ff9500";
  return "#007aff";
}

function getAllowedParentLevels(level: PlanLevel): PlanLevel[] {
  if (level === "month") {
    return ["year"];
  }

  if (level === "week") {
    return ["year", "month"];
  }

  return [];
}

function canUseParentPlan(plan: PlanItem, childLevel: PlanLevel, editingPlanId?: string | null) {
  return plan.id !== editingPlanId && getAllowedParentLevels(childLevel).includes(plan.level);
}

function getPlanChain(plan: PlanItem, plans: PlanItem[]) {
  const chain: PlanItem[] = [];
  const seen = new Set<string>();
  let current: PlanItem | undefined = plan;

  while (current && !seen.has(current.id)) {
    chain.unshift(current);
    seen.add(current.id);
    current = current.parentPlanId ? plans.find((item) => item.id === current?.parentPlanId) : undefined;
  }

  return chain;
}

function getPlanChainLabel(plan: PlanItem, plans: PlanItem[]) {
  return getPlanChain(plan, plans)
    .map((item) => item.title)
    .join(" / ");
}

function getPlanSourceLabel(event: CalendarEvent, plans: PlanItem[]) {
  if (!event.planId) {
    return "";
  }

  const plan = plans.find((item) => item.id === event.planId);
  if (!plan) {
    return "来自计划";
  }

  const task = plan.tasks.find((item) => item.id === event.planTaskId);
  const planPath = getPlanChainLabel(plan, plans);
  return task ? `来自计划：${planPath} / ${task.title}` : `来自计划：${planPath}`;
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function getPlanComputedProgress(plan: PlanItem) {
  if (plan.status === "done") {
    return 100;
  }

  return clampPercent(plan.progress);
}

function getPlanAutoTimeProgress(plan: PlanItem, todayStr: string) {
  if (todayStr < plan.startDate) {
    return 0;
  }

  if (todayStr > plan.endDate) {
    return 100;
  }

  const totalDays = Math.max(1, daysBetween(plan.endDate, plan.startDate) + 1);
  const elapsedDays = Math.min(totalDays, Math.max(0, daysBetween(todayStr, plan.startDate) + 1));
  return clampPercent((elapsedDays / totalDays) * 100);
}

function getPlanTimeProgress(plan: PlanItem, todayStr: string) {
  return typeof plan.timeProgressOverride === "number" ? clampPercent(plan.timeProgressOverride) : getPlanAutoTimeProgress(plan, todayStr);
}

function getPlanTimeProgressLabel(plan: PlanItem, todayStr: string) {
  const value = getPlanTimeProgress(plan, todayStr);
  return typeof plan.timeProgressOverride === "number" ? `时间进度 ${value}% · 手动校准` : `时间进度 ${value}% · 自动`;
}

function getPlanDeliverable(plan: PlanItem) {
  return plan.deliverable.trim() || plan.goal.trim() || "未填写交付物";
}

function getChildPlanLevelLabel(level: PlanLevel) {
  if (level === "year") {
    return "下级月计划";
  }

  if (level === "month") {
    return "下级周计划";
  }

  return "";
}

function getPlanTimeline(plans: PlanItem[]) {
  if (plans.length === 0) {
    return { start: getDateStr(new Date()), end: getDateStr(addDays(new Date(), 30)), spanDays: 30 };
  }

  const start = plans.reduce((min, plan) => (plan.startDate < min ? plan.startDate : min), plans[0].startDate);
  const end = plans.reduce((max, plan) => (plan.endDate > max ? plan.endDate : max), plans[0].endDate);
  const spanDays = Math.max(1, daysBetween(end, start) + 1);
  return { start, end, spanDays };
}

function getOccurrenceStart(event: CalendarEvent, occurrenceDate: string) {
  const start = parseDateStr(occurrenceDate);
  const [hours, minutes] = (event.time ?? "09:00").split(":").map(Number);
  start.setHours(hours, minutes, 0, 0);
  return start;
}

function readReminderKeys() {
  try {
    const raw = window.localStorage.getItem(remindedStorageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function writeReminderKeys(keys: Set<string>) {
  const trimmed = Array.from(keys).slice(-400);
  window.localStorage.setItem(remindedStorageKey, JSON.stringify(trimmed));
}

function checkDueReminders(events: CalendarEvent[], showToast: (message: string) => void) {
  const now = new Date();
  const rangeStart = getDateStr(addDays(now, -2));
  const rangeEnd = getDateStr(addDays(now, 2));
  const occurrences = expandOccurrences(events, rangeStart, rangeEnd);
  const remindedKeys = readReminderKeys();
  let changed = false;

  occurrences.forEach((occurrence) => {
    const reminderMinutes = occurrence.event.reminderMinutes;
    if (reminderMinutes === null) {
      return;
    }

    const eventStart = getOccurrenceStart(occurrence.event, occurrence.occurrenceDate);
    const reminderAt = addMinutes(eventStart, -reminderMinutes);
    const diffMs = now.getTime() - reminderAt.getTime();
    const key = `${occurrence.event.id}:${occurrence.occurrenceDate}:${reminderMinutes}`;

    if (diffMs >= 0 && diffMs < 60 * 1000 && !remindedKeys.has(key)) {
      const message = `${occurrence.event.title} · ${formatTime(occurrence.event)}`;
      showToast(`提醒：${message}`);

      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("日历提醒", {
          body: `${formatFullDate(occurrence.occurrenceDate)} ${message}`,
        });
      }

      remindedKeys.add(key);
      changed = true;
    }
  });

  if (changed) {
    writeReminderKeys(remindedKeys);
  }
}

function downloadText(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeIcs(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function formatIcsDate(dateStr: string) {
  return dateStr.replace(/-/g, "");
}

function formatIcsDateTime(date: Date) {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}T${pad2(date.getHours())}${pad2(
    date.getMinutes(),
  )}00`;
}

function buildRRule(event: CalendarEvent) {
  if (event.repeatRule === "none") {
    return "";
  }

  const freqMap: Record<Exclude<RepeatRule, "none">, string> = {
    daily: "DAILY",
    weekly: "WEEKLY",
    monthly: "MONTHLY",
    yearly: "YEARLY",
  };
  const parts = [`FREQ=${freqMap[event.repeatRule]}`];

  if (event.repeatUntil) {
    parts.push(`UNTIL=${formatIcsDate(event.repeatUntil)}`);
  }

  return `RRULE:${parts.join(";")}`;
}

function buildIcs(events: CalendarEvent[]) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Local Calendar//ZH-CN", "CALSCALE:GREGORIAN"];
  const stamp = formatIcsDateTime(new Date());

  events.forEach((event) => {
    const category = getCategory(event.calendarId);
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.id}@local-calendar`);
    lines.push(`DTSTAMP:${stamp}`);

    if (event.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(event.date)}`);
      lines.push(`DTEND;VALUE=DATE:${formatIcsDate(getDateStr(addDays(parseDateStr(event.date), 1)))}`);
    } else {
      lines.push(`DTSTART:${formatIcsDateTime(getOccurrenceStart(event, event.date))}`);
      lines.push(`DTEND:${formatIcsDateTime(addMinutes(getOccurrenceStart(event, event.date), 60))}`);
    }

    lines.push(`SUMMARY:${escapeIcs(event.title)}`);
    if (event.notes) {
      lines.push(`DESCRIPTION:${escapeIcs(event.notes)}`);
    }
    lines.push(`CATEGORIES:${escapeIcs(category.name)}`);

    const rrule = buildRRule(event);
    if (rrule) {
      lines.push(rrule);
    }

    if (event.reminderMinutes !== null) {
      lines.push("BEGIN:VALARM");
      lines.push(`TRIGGER:-PT${event.reminderMinutes}M`);
      lines.push("ACTION:DISPLAY");
      lines.push(`DESCRIPTION:${escapeIcs(event.title)}`);
      lines.push("END:VALARM");
    }

    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function StatCard({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint: string }) {
  return (
    <article className="stat-card">
      <span className="stat-icon">{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{hint}</p>
      </div>
    </article>
  );
}

function MiniBar({ label, value, color }: { label: string; value: number; color: string }) {
  const width = Math.max(4, Math.min(100, value));
  return (
    <div className="mini-bar">
      <span>{label}</span>
      <div aria-hidden="true">
        <i style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function GanttChart({
  plans,
  timeline,
  todayStr,
  onEdit,
}: {
  plans: PlanItem[];
  timeline: { start: string; end: string; spanDays: number };
  todayStr: string;
  onEdit: (id: string) => void;
}) {
  if (plans.length === 0) {
    return (
      <div className="panel-empty compact">
        <ChartGantt size={30} />
        <span>暂无计划甘特图</span>
      </div>
    );
  }

  return (
    <div className="gantt-card">
      <div className="gantt-scale">
        <span>{formatShortDate(timeline.start)}</span>
        <span>{formatShortDate(timeline.end)}</span>
      </div>
      <div className="gantt-list">
        {plans.map((plan) => {
          const offset = Math.max(0, daysBetween(plan.startDate, timeline.start));
          const duration = Math.max(1, daysBetween(plan.endDate, plan.startDate) + 1);
          const left = Math.min(96, (offset / timeline.spanDays) * 100);
          const width = Math.max(8, Math.min(100 - left, (duration / timeline.spanDays) * 100));
          const progress = getPlanComputedProgress(plan);
          const timeProgress = getPlanTimeProgress(plan, todayStr);

          return (
            <article className="gantt-row" key={plan.id}>
              <button className="gantt-label" type="button" onClick={() => onEdit(plan.id)}>
                <strong>{plan.title}</strong>
                <span>
                  {getPlanLevelLabel(plan.level)} · 时间 {timeProgress}%
                </span>
              </button>
              <div className="gantt-track" aria-label={`${plan.title} ${progress}%`}>
                <span
                  className="gantt-bar"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    backgroundColor: getPlanLevelColor(plan.level),
                  }}
                >
                  <i style={{ width: `${progress}%` }} />
                  <b style={{ left: `${timeProgress}%` }} aria-hidden="true" />
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  plans,
  todayStr,
  onEdit,
  onDelete,
  onScheduleTask,
}: {
  plan: PlanItem;
  plans: PlanItem[];
  todayStr: string;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onScheduleTask: (planId: string, taskId: string) => void;
}) {
  const progress = getPlanComputedProgress(plan);
  const timeProgress = getPlanTimeProgress(plan, todayStr);
  const scheduledCount = plan.tasks.filter((task) => task.status === "scheduled" || task.scheduledEventId).length;
  const childCount = plans.filter((item) => item.parentPlanId === plan.id).length;
  const planPath = getPlanChainLabel(plan, plans);

  return (
    <article className="plan-card">
      <div className="plan-card-top">
        <button className="plan-main" type="button" onClick={() => onEdit(plan.id)}>
          <span className="plan-accent" style={{ backgroundColor: getPlanLevelColor(plan.level) }} />
          <span className="plan-copy">
            <strong>{plan.title}</strong>
            <small>
              {getPlanLevelLabel(plan.level)} · {formatShortDate(plan.startDate)} - {formatShortDate(plan.endDate)} ·{" "}
              {getPlanStatusLabel(plan.status)}
            </small>
            {plan.parentPlanId ? <em>链路：{planPath}</em> : null}
            {plan.goal ? <p>{plan.goal}</p> : null}
            <p className="plan-deliverable">交付物：{getPlanDeliverable(plan)}</p>
            <span className="plan-progress-group">
              <span className="plan-progress-line">
                <span>完成 {progress}%</span>
                <span className="plan-progress" aria-label={`完成进度 ${progress}%`}>
                  <i style={{ width: `${progress}%`, backgroundColor: getPlanLevelColor(plan.level) }} />
                </span>
              </span>
              <span className="plan-progress-line time">
                <span>{getPlanTimeProgressLabel(plan, todayStr)}</span>
                <span className="plan-progress" aria-label={`时间进度 ${timeProgress}%`}>
                  <i style={{ width: `${timeProgress}%` }} />
                </span>
              </span>
            </span>
          </span>
          <span className="plan-percent">
            <b>{progress}%</b>
            <small>{timeProgress}%</small>
          </span>
        </button>
        <button className="event-delete-btn" type="button" aria-label={`删除 ${plan.title}`} onClick={() => onDelete(plan.id)}>
          <Trash2 size={15} />
        </button>
      </div>
      <div className="plan-task-summary">
        <span>{plan.tasks.length} 个事项</span>
        <span>{scheduledCount} 个已安排到日历</span>
        <span>{childCount} 个下级计划</span>
      </div>
      {plan.tasks.length > 0 ? (
        <div className="plan-task-list">
          {plan.tasks.slice(0, 4).map((task) => (
            <div className="plan-task-row" key={task.id}>
              <span className={`task-status-dot ${task.status}`} />
              <div>
                <strong>{task.title}</strong>
                <small>
                  {planTaskStatusOptions.find((option) => option.value === task.status)?.label ?? "待安排"}
                  {task.scheduledDate ? ` · ${formatShortDate(task.scheduledDate)}` : ""}
                </small>
              </div>
              <button type="button" onClick={() => onScheduleTask(plan.id, task.id)}>
                {task.scheduledEventId ? "调整" : "安排"}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export default function App() {
  const [todayStr, setTodayStr] = useState(() => getDateStr(new Date()));
  const today = useMemo(() => parseDateStr(todayStr), [todayStr]);
  const [events, setEvents] = useState<CalendarEvent[]>(loadInitialEvents);
  const [plans, setPlans] = useState<PlanItem[]>(loadInitialPlans);
  const [activeView, setActiveView] = useState<AppView>("calendar");
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [calendarPickerMode, setCalendarPickerMode] = useState<CalendarPickerMode>("days");
  const [yearPageStart, setYearPageStart] = useState(() => today.getFullYear() - (today.getFullYear() % 12));
  const [selectedDate, setSelectedDate] = useState<string | null>(todayStr);
  const [activeSheet, setActiveSheet] = useState<"event" | "search" | "tools" | "plan" | "scheduleTask" | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EventDraft>(() => createDraft(todayStr));
  const [planDraft, setPlanDraft] = useState<PlanDraft>(() => createPlanDraft(todayStr));
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleTaskDraft | null>(null);
  const [newPlanTaskTitle, setNewPlanTaskTitle] = useState("");
  const [planFilter, setPlanFilter] = useState<PlanLevel | "all">("all");
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);
  const [dayPanelExpanded, setDayPanelExpanded] = useState(false);
  const [weatherInfo, setWeatherInfo] = useState<WeatherInfo>(initialWeatherInfo);
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [cloudEmail, setCloudEmail] = useState("");
  const [cloudPassword, setCloudPassword] = useState("");
  const [cloudSync, setCloudSync] = useState<CloudSyncState>(() => ({
    status: supabase ? "idle" : "error",
    message: supabase ? "未登录云同步" : "未配置 Supabase",
    cloudUpdatedAt: null,
    localUpdatedAt: getStoredLocalUpdatedAt(),
  }));
  const [searchQuery, setSearchQuery] = useState("");
  const [toast, setToast] = useState("");
  const toastTimerRef = useRef<number>();
  const panelDragStartYRef = useRef(0);
  const panelDragMovedRef = useRef(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const updateToday = () => setTodayStr(getDateStr(new Date()));
    const timer = window.setInterval(updateToday, 60 * 1000);
    updateToday();
    return () => window.clearInterval(timer);
  }, []);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }

    setToast(message);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2200);
  }, []);

  const loadWeather = useCallback(async () => {
    setWeatherInfo((current) => ({ ...current, status: "loading" }));

    let latitude = fallbackWeatherLocation.latitude;
    let longitude = fallbackWeatherLocation.longitude;
    let locationLabel = fallbackWeatherLocation.label;
    let isFallbackLocation = true;

    try {
      const position = await getBrowserPosition();
      latitude = position.coords.latitude;
      longitude = position.coords.longitude;
      locationLabel = "当前位置";
      isFallbackLocation = false;
    } catch {
      locationLabel = fallbackWeatherLocation.label;
    }

    try {
      const params = new URLSearchParams({
        latitude: latitude.toFixed(4),
        longitude: longitude.toFixed(4),
        current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
        daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        timezone: "auto",
        forecast_days: "1",
      });
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Weather request failed");
      }

      const data = await response.json();
      setWeatherInfo({
        status: "ready",
        locationLabel,
        temperature: data.current?.temperature_2m ?? null,
        apparentTemperature: data.current?.apparent_temperature ?? null,
        high: data.daily?.temperature_2m_max?.[0] ?? null,
        low: data.daily?.temperature_2m_min?.[0] ?? null,
        precipitationProbability: data.daily?.precipitation_probability_max?.[0] ?? null,
        windSpeed: data.current?.wind_speed_10m ?? null,
        condition: getWeatherCondition(data.current?.weather_code ?? -1),
        updatedAt: data.current?.time ?? new Date().toISOString(),
        isFallbackLocation,
      });
    } catch {
      setWeatherInfo((current) => ({
        ...current,
        status: "error",
        condition: "天气不可用",
        updatedAt: new Date().toISOString(),
      }));
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(eventsStorageKey, JSON.stringify(events));
    const updatedAt = new Date().toISOString();
    setStoredLocalUpdatedAt(updatedAt);
    setCloudSync((current) => ({ ...current, localUpdatedAt: updatedAt }));
  }, [events]);

  useEffect(() => {
    loadWeather();
  }, [loadWeather]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      setCloudUser(data.user ?? null);
      if (data.user?.email) {
        setCloudEmail(data.user.email);
        setCloudSync((current) => ({ ...current, status: "ready", message: "云同步已登录" }));
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setCloudUser(session?.user ?? null);
      if (session?.user?.email) {
        setCloudEmail(session.user.email);
        setCloudSync((current) => ({ ...current, status: "ready", message: "云同步已登录" }));
      } else {
        setCloudSync((current) => ({ ...current, status: "idle", message: "未登录云同步" }));
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    window.localStorage.setItem(plansStorageKey, JSON.stringify(plans));
    const updatedAt = new Date().toISOString();
    setStoredLocalUpdatedAt(updatedAt);
    setCloudSync((current) => ({ ...current, localUpdatedAt: updatedAt }));
  }, [plans]);

  useEffect(() => {
    const timer = window.setInterval(() => checkDueReminders(events, showToast), 30 * 1000);
    checkDueReminders(events, showToast);
    return () => window.clearInterval(timer);
  }, [events, showToast]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (activeView !== "calendar" || calendarPickerMode !== "days") {
      setDayPanelExpanded(false);
    }
  }, [activeView, calendarPickerMode]);

  const calendarCells = useMemo(() => buildCalendarCells(currentYear, currentMonth), [currentYear, currentMonth]);
  const isDayPanelWeekMode = dayPanelExpanded && calendarPickerMode === "days";
  const displayCalendarCells = useMemo(() => {
    if (!isDayPanelWeekMode) {
      return calendarCells;
    }

    const anchorDate = selectedDate ?? todayStr;
    const anchorIndex = calendarCells.findIndex((cell) => cell.dateStr === anchorDate);
    if (anchorIndex < 0) {
      return calendarCells;
    }

    const weekStart = Math.floor(anchorIndex / 7) * 7;
    return calendarCells.slice(weekStart, weekStart + 7);
  }, [calendarCells, isDayPanelWeekMode, selectedDate, todayStr]);
  const visibleOccurrences = useMemo(() => {
    return expandOccurrences(events, calendarCells[0].dateStr, calendarCells[calendarCells.length - 1].dateStr);
  }, [calendarCells, events]);
  const occurrencesByDate = useMemo(() => groupOccurrences(visibleOccurrences), [visibleOccurrences]);
  const selectedOccurrences = selectedDate ? occurrencesByDate[selectedDate] ?? [] : [];
  const deadlinesByDate = useMemo(() => {
    const map: Record<string, PlanItem[]> = {};
    plans.forEach((plan) => {
      if (!map[plan.endDate]) {
        map[plan.endDate] = [];
      }
      map[plan.endDate].push(plan);
    });

    Object.values(map).forEach((items) =>
      items.sort((a, b) => {
        if (a.level !== b.level) {
          return getAllowedParentLevels(a.level).length - getAllowedParentLevels(b.level).length;
        }

        return a.createdAt - b.createdAt;
      }),
    );

    return map;
  }, [plans]);
  const selectedDeadlines = selectedDate ? deadlinesByDate[selectedDate] ?? [] : [];

  const upcomingOccurrences = useMemo(() => {
    return expandOccurrences(events, todayStr, getDateStr(addDays(today, 30))).slice(0, 12);
  }, [events, today, todayStr]);
  const collapsedUpcomingCount = 3;
  const expandedUpcomingCount = 6;
  const visibleUpcomingOccurrences = upcomingExpanded
    ? upcomingOccurrences.slice(0, expandedUpcomingCount)
    : upcomingOccurrences.slice(0, collapsedUpcomingCount);
  const hiddenUpcomingCount = Math.max(0, Math.min(upcomingOccurrences.length, expandedUpcomingCount) - collapsedUpcomingCount);

  const dashboardStats = useMemo(() => {
    const weekEnd = getDateStr(addDays(today, 6));
    const thisWeekEvents = expandOccurrences(events, todayStr, weekEnd);
    const plannedCount = plans.length;
    const completedPlans = plans.filter((plan) => plan.status === "done").length;
    const activePlans = plans.filter((plan) => plan.status !== "done").length;
    const taskCount = plans.reduce((count, plan) => count + plan.tasks.length, 0);
    const scheduledTasks = plans.reduce(
      (count, plan) => count + plan.tasks.filter((task) => task.status === "scheduled" || task.scheduledEventId).length,
      0,
    );
    const averageProgress = plannedCount
      ? Math.round(plans.reduce((sum, plan) => sum + getPlanComputedProgress(plan), 0) / plannedCount)
      : 0;
    const averageTimeProgress = plannedCount
      ? Math.round(plans.reduce((sum, plan) => sum + getPlanTimeProgress(plan, todayStr), 0) / plannedCount)
      : 0;

    return {
      thisWeekEvents: thisWeekEvents.length,
      plannedCount,
      completedPlans,
      activePlans,
      taskCount,
      scheduledTasks,
      averageProgress,
      averageTimeProgress,
    };
  }, [events, plans, today, todayStr]);

  const categoryStats = useMemo(() => {
    const monthStart = getDateStr(new Date(currentYear, currentMonth, 1));
    const monthEnd = getDateStr(new Date(currentYear, currentMonth + 1, 0));
    const monthOccurrences = expandOccurrences(events, monthStart, monthEnd);

    return categories.map((category) => ({
      category,
      count: monthOccurrences.filter((occurrence) => occurrence.event.calendarId === category.id).length,
    }));
  }, [currentMonth, currentYear, events]);

  const planCounts = useMemo(() => {
    return planLevelOptions.map((option) => ({
      ...option,
      count: plans.filter((plan) => plan.level === option.value).length,
    }));
  }, [plans]);

  const sortedPlans = useMemo(() => {
    return [...plans].sort((a, b) => {
      if (a.startDate !== b.startDate) {
        return a.startDate.localeCompare(b.startDate);
      }

      return b.createdAt - a.createdAt;
    });
  }, [plans]);

  const filteredPlans = useMemo(() => {
    return planFilter === "all" ? sortedPlans : sortedPlans.filter((plan) => plan.level === planFilter);
  }, [planFilter, sortedPlans]);

  const parentPlanOptions = useMemo(() => {
    return sortedPlans.filter((plan) => canUseParentPlan(plan, planDraft.level, editingPlanId));
  }, [editingPlanId, planDraft.level, sortedPlans]);

  const childPlansForEditing = useMemo(() => {
    if (!editingPlanId) {
      return [];
    }

    return sortedPlans.filter((plan) => plan.parentPlanId === editingPlanId);
  }, [editingPlanId, sortedPlans]);

  const ganttPlans = useMemo(() => sortedPlans.slice(0, 8), [sortedPlans]);
  const ganttTimeline = useMemo(() => getPlanTimeline(ganttPlans), [ganttPlans]);
  const yearsInPicker = useMemo(() => Array.from({ length: 12 }, (_, index) => yearPageStart + index), [yearPageStart]);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const start = query ? getDateStr(addDays(today, -365)) : todayStr;
    const end = query ? getDateStr(addDays(today, 730)) : getDateStr(addDays(today, 30));
    const occurrences = expandOccurrences(events, start, end);

    return occurrences
      .filter((occurrence) => {
        if (!query) {
          return occurrence.occurrenceDate >= todayStr;
        }

        const category = getCategory(occurrence.event.calendarId);
        return [
          occurrence.event.title,
          occurrence.event.notes,
          category.name,
          occurrence.occurrenceDate,
          getRepeatLabel(occurrence.event.repeatRule),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .slice(0, 80);
  }, [events, searchQuery, today, todayStr]);

  const updateMonth = (dateStr: string) => {
    const nextDate = parseDateStr(dateStr);
    setCurrentYear(nextDate.getFullYear());
    setCurrentMonth(nextDate.getMonth());
    setYearPageStart(nextDate.getFullYear() - (nextDate.getFullYear() % 12));
  };

  const selectDate = (dateStr: string) => {
    updateMonth(dateStr);
    setSelectedDate(dateStr);
    setCalendarPickerMode("days");
  };

  const changeMonth = (delta: number) => {
    const next = new Date(currentYear, currentMonth + delta, 1);
    setDayPanelExpanded(false);
    setCurrentYear(next.getFullYear());
    setCurrentMonth(next.getMonth());
    setYearPageStart(next.getFullYear() - (next.getFullYear() % 12));

    if (selectedDate) {
      const selected = parseDateStr(selectedDate);
      if (selected.getFullYear() !== next.getFullYear() || selected.getMonth() !== next.getMonth()) {
        setSelectedDate(null);
      }
    }
  };

  const goToday = () => {
    updateMonth(todayStr);
    setSelectedDate(todayStr);
    setCalendarPickerMode("days");
    setDayPanelExpanded(false);
  };

  const cycleCalendarPicker = () => {
    if (calendarPickerMode === "days") {
      setCalendarPickerMode("months");
      return;
    }

    if (calendarPickerMode === "months") {
      setCalendarPickerMode("years");
      setYearPageStart(currentYear - (currentYear % 12));
      return;
    }

    setCalendarPickerMode("days");
  };

  const changeCalendarPeriod = (delta: number) => {
    if (calendarPickerMode === "days") {
      changeMonth(delta);
      return;
    }

    if (calendarPickerMode === "months") {
      const nextYear = currentYear + delta;
      setCurrentYear(nextYear);
      setYearPageStart(nextYear - (nextYear % 12));
      return;
    }

    setYearPageStart((current) => current + delta * 12);
  };

  const selectMonthFromPicker = (month: number) => {
    setCurrentMonth(month);
    setCalendarPickerMode("days");
    setDayPanelExpanded(false);
    if (selectedDate) {
      const selected = parseDateStr(selectedDate);
      if (selected.getFullYear() !== currentYear || selected.getMonth() !== month) {
        setSelectedDate(null);
      }
    }
  };

  const selectYearFromPicker = (year: number) => {
    setCurrentYear(year);
    setYearPageStart(year - (year % 12));
    setCalendarPickerMode("months");
    setDayPanelExpanded(false);
    if (selectedDate && parseDateStr(selectedDate).getFullYear() !== year) {
      setSelectedDate(null);
    }
  };

  const handlePanelHandlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    panelDragStartYRef.current = event.clientY;
    panelDragMovedRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePanelHandlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }

    const deltaY = event.clientY - panelDragStartYRef.current;
    if (Math.abs(deltaY) < 28) {
      return;
    }

    panelDragMovedRef.current = true;
    setDayPanelExpanded(deltaY < 0);
  };

  const handlePanelHandlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlePanelHandleClick = () => {
    if (panelDragMovedRef.current) {
      panelDragMovedRef.current = false;
      return;
    }

    setDayPanelExpanded((current) => !current);
  };

  const openAddSheet = (dateStr = selectedDate ?? todayStr) => {
    setEditingEventId(null);
    setDraft(createDraft(dateStr));
    setActiveSheet("event");
  };

  const openEditSheet = (eventId: string) => {
    const event = events.find((item) => item.id === eventId);
    if (!event) {
      return;
    }

    setEditingEventId(eventId);
    setDraft(createDraft(event.date, event));
    setActiveSheet("event");
  };

  const openAddPlanSheet = (level: PlanLevel = "month") => {
    const start = selectedDate ?? todayStr;
    const draft = createPlanDraft(start);
    setEditingPlanId(null);
    setPlanDraft({
      ...draft,
      level,
      parentPlanId: undefined,
      endDate:
        level === "year"
          ? getDateStr(new Date(parseDateStr(start).getFullYear(), 11, 31))
          : level === "month"
            ? getDateStr(new Date(parseDateStr(start).getFullYear(), parseDateStr(start).getMonth() + 1, 0))
            : getDateStr(addDays(parseDateStr(start), 6)),
    });
    setActiveSheet("plan");
  };

  const openEditPlanSheet = (planId: string) => {
    const plan = plans.find((item) => item.id === planId);
    if (!plan) {
      return;
    }

    setEditingPlanId(planId);
    setPlanDraft(createPlanDraft(plan.startDate, plan));
    setNewPlanTaskTitle("");
    setActiveSheet("plan");
  };

  const addPlanTaskToDraft = () => {
    const title = newPlanTaskTitle.trim();
    if (!title) {
      showToast("请输入事项内容");
      return;
    }

    setPlanDraft((current) => ({
      ...current,
      tasks: [
        ...current.tasks,
        {
          id: generateId(),
          title,
          notes: "",
          status: "todo",
          createdAt: Date.now(),
        },
      ],
    }));
    setNewPlanTaskTitle("");
  };

  const updatePlanTaskDraft = (taskId: string, updates: Partial<PlanTask>) => {
    setPlanDraft((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              ...updates,
              updatedAt: Date.now(),
            }
          : task,
      ),
    }));
  };

  const deletePlanTaskFromDraft = (taskId: string) => {
    setPlanDraft((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => task.id !== taskId),
    }));
  };

  const openScheduleTaskSheet = (planId: string, taskId: string) => {
    const plan = plans.find((item) => item.id === planId);
    const task = plan?.tasks.find((item) => item.id === taskId);
    if (!plan || !task) {
      return;
    }

    setScheduleDraft({
      planId,
      taskId,
      title: task.title,
      date: task.scheduledDate ?? selectedDate ?? todayStr,
      time: task.scheduledTime ?? "09:00",
      allDay: task.scheduledTime === null,
      calendarId: "work",
      reminderMinutes: 15,
    });
    setActiveSheet("scheduleTask");
  };

  const closeSheet = () => {
    setActiveSheet(null);
    setEditingEventId(null);
    setEditingPlanId(null);
    setScheduleDraft(null);
  };

  const handleSaveEvent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = draft.title.trim();

    if (!title) {
      showToast("请输入事件标题");
      return;
    }

    if (!isValidDateStr(draft.date)) {
      showToast("请选择有效日期");
      return;
    }

    if (draft.repeatRule !== "none" && draft.repeatUntil && draft.repeatUntil < draft.date) {
      showToast("重复结束日期不能早于开始日期");
      return;
    }

    const nextEvent: CalendarEvent = {
      id: editingEventId ?? generateId(),
      title,
      date: draft.date,
      time: draft.allDay ? null : draft.time,
      allDay: draft.allDay,
      notes: draft.notes.trim(),
      calendarId: draft.calendarId,
      repeatRule: draft.repeatRule,
      repeatUntil: draft.repeatRule === "none" ? undefined : draft.repeatUntil || undefined,
      reminderMinutes: draft.reminderMinutes,
      planId: draft.planId,
      planTaskId: draft.planTaskId,
      createdAt: events.find((item) => item.id === editingEventId)?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };

    setEvents((current) => {
      if (!editingEventId) {
        return [...current, nextEvent];
      }

      return current.map((item) => (item.id === editingEventId ? nextEvent : item));
    });

    if (nextEvent.reminderMinutes !== null && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => undefined);
    }

    updateMonth(nextEvent.date);
    setSelectedDate(nextEvent.date);
    closeSheet();
    showToast(editingEventId ? "事件已更新" : "事件已添加");
  };

  const deleteEvent = (eventId: string) => {
    if (!window.confirm("确定要删除这个事件吗？此操作无法撤销。")) {
      return;
    }

    const eventToDelete = events.find((event) => event.id === eventId);
    setEvents((current) => current.filter((event) => event.id !== eventId));
    if (eventToDelete?.planId && eventToDelete.planTaskId) {
      setPlans((current) =>
        current.map((plan) =>
          plan.id === eventToDelete.planId
            ? {
                ...plan,
                tasks: plan.tasks.map((task) =>
                  task.id === eventToDelete.planTaskId
                    ? {
                        ...task,
                        status: "todo",
                        scheduledEventId: undefined,
                        scheduledDate: undefined,
                        scheduledTime: undefined,
                        updatedAt: Date.now(),
                      }
                    : task,
                ),
                updatedAt: Date.now(),
              }
            : plan,
        ),
      );
    }
    if (editingEventId === eventId) {
      closeSheet();
    }
    showToast("事件已删除");
  };

  const handleSavePlan = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = planDraft.title.trim();

    if (!title) {
      showToast("请输入计划标题");
      return;
    }

    if (!isValidDateStr(planDraft.startDate) || !isValidDateStr(planDraft.endDate)) {
      showToast("请选择有效日期");
      return;
    }

    if (planDraft.endDate < planDraft.startDate) {
      showToast("结束日期不能早于开始日期");
      return;
    }

    const parentPlanId =
      planDraft.parentPlanId && plans.some((plan) => canUseParentPlan(plan, planDraft.level, editingPlanId) && plan.id === planDraft.parentPlanId)
        ? planDraft.parentPlanId
        : undefined;

    const nextPlan: PlanItem = {
      id: editingPlanId ?? generateId(),
      title,
      level: planDraft.level,
      parentPlanId,
      startDate: planDraft.startDate,
      endDate: planDraft.endDate,
      goal: planDraft.goal.trim(),
      deliverable: planDraft.deliverable.trim(),
      notes: planDraft.notes.trim(),
      status: planDraft.progress >= 100 ? "done" : planDraft.status,
      progress: planDraft.status === "done" ? 100 : clampPercent(planDraft.progress),
      timeProgressOverride:
        typeof planDraft.timeProgressOverride === "number" ? clampPercent(planDraft.timeProgressOverride) : undefined,
      tasks: planDraft.tasks,
      createdAt: plans.find((item) => item.id === editingPlanId)?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };

    setPlans((current) => {
      if (!editingPlanId) {
        return [...current, nextPlan];
      }

      return current.map((item) =>
        item.id === editingPlanId
          ? nextPlan
          : item.parentPlanId === editingPlanId && !getAllowedParentLevels(item.level).includes(nextPlan.level)
            ? { ...item, parentPlanId: undefined, updatedAt: Date.now() }
            : item,
      );
    });

    setActiveView("plans");
    closeSheet();
    showToast(editingPlanId ? "计划已更新" : "计划已添加");
  };

  const handleScheduleTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!scheduleDraft) {
      return;
    }

    const title = scheduleDraft.title.trim();
    if (!title) {
      showToast("请输入事项标题");
      return;
    }

    if (!isValidDateStr(scheduleDraft.date)) {
      showToast("请选择有效日期");
      return;
    }

    const plan = plans.find((item) => item.id === scheduleDraft.planId);
    const task = plan?.tasks.find((item) => item.id === scheduleDraft.taskId);
    if (!plan || !task) {
      showToast("找不到对应计划事项");
      return;
    }

    const eventId = task.scheduledEventId ?? generateId();
    const scheduledEvent: CalendarEvent = {
      id: eventId,
      title,
      date: scheduleDraft.date,
      time: scheduleDraft.allDay ? null : scheduleDraft.time,
      allDay: scheduleDraft.allDay,
      notes: `来自计划：${getPlanChainLabel(plan, plans)}${task.notes ? `\n${task.notes}` : ""}`,
      calendarId: scheduleDraft.calendarId,
      repeatRule: "none",
      repeatUntil: undefined,
      reminderMinutes: scheduleDraft.reminderMinutes,
      planId: plan.id,
      planTaskId: task.id,
      createdAt: events.find((item) => item.id === eventId)?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };

    setEvents((current) => {
      const exists = current.some((item) => item.id === eventId);
      return exists ? current.map((item) => (item.id === eventId ? scheduledEvent : item)) : [...current, scheduledEvent];
    });

    setPlans((current) =>
      current.map((item) =>
        item.id === plan.id
          ? {
              ...item,
              tasks: item.tasks.map((planTask) =>
                planTask.id === task.id
                  ? {
                      ...planTask,
                      title,
                      status: "scheduled",
                      scheduledEventId: eventId,
                      scheduledDate: scheduleDraft.date,
                      scheduledTime: scheduleDraft.allDay ? null : scheduleDraft.time,
                      updatedAt: Date.now(),
                    }
                  : planTask,
              ),
              updatedAt: Date.now(),
            }
          : item,
      ),
    );

    setSelectedDate(scheduleDraft.date);
    updateMonth(scheduleDraft.date);
    setActiveView("calendar");
    closeSheet();
    showToast("事项已安排到日历");
  };

  const deletePlan = (planId: string) => {
    if (!window.confirm("确定要删除这个计划吗？")) {
      return;
    }

    setEvents((current) =>
      current.map((event) =>
        event.planId === planId
          ? {
              ...event,
              planId: undefined,
              planTaskId: undefined,
              updatedAt: Date.now(),
            }
          : event,
      ),
    );
    setPlans((current) =>
      current
        .filter((plan) => plan.id !== planId)
        .map((plan) => (plan.parentPlanId === planId ? { ...plan, parentPlanId: undefined, updatedAt: Date.now() } : plan)),
    );
    if (editingPlanId === planId) {
      closeSheet();
    }
    showToast("计划已删除");
  };

  const handleExportJson = () => {
    downloadText(
      `calendar-${todayStr}.json`,
      JSON.stringify({ exportedAt: new Date().toISOString(), events, plans }, null, 2),
      "application/json;charset=utf-8",
    );
    showToast("JSON 已导出");
  };

  const handleExportIcs = () => {
    downloadText(`calendar-${todayStr}.ics`, buildIcs(events), "text/calendar;charset=utf-8");
    showToast("ICS 已导出");
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const eventSource: unknown = Array.isArray(parsed) ? parsed : parsed?.events;
      const planSource: unknown[] = Array.isArray(parsed?.plans) ? parsed.plans : [];

      if (!Array.isArray(eventSource) && !Array.isArray(planSource)) {
        throw new Error("Invalid calendar JSON");
      }

      const incomingEvents = Array.isArray(eventSource)
        ? eventSource.map(normalizeEvent).filter((item): item is CalendarEvent => item !== null)
        : [];
      const incomingPlans = planSource.map(normalizePlan).filter((item): item is PlanItem => item !== null);
      if (incomingEvents.length === 0 && incomingPlans.length === 0) {
        throw new Error("No valid records");
      }

      if (incomingEvents.length > 0) {
        setEvents((current) => {
          const merged = new Map(current.map((item) => [item.id, item]));
          incomingEvents.forEach((item) => merged.set(item.id, item));
          return Array.from(merged.values()).sort((a, b) => a.date.localeCompare(b.date));
        });
      }

      if (incomingPlans.length > 0) {
        setPlans((current) => {
          const merged = new Map(current.map((item) => [item.id, item]));
          incomingPlans.forEach((item) => merged.set(item.id, item));
          return Array.from(merged.values()).sort((a, b) => a.startDate.localeCompare(b.startDate));
        });
      }

      setActiveSheet(null);
      showToast(`已导入 ${incomingEvents.length} 个事件、${incomingPlans.length} 个计划`);
    } catch {
      showToast("导入失败，请检查 JSON 文件");
    }
  };

  const handleCloudAuth = async (mode: "signIn" | "signUp") => {
    if (!supabase) {
      showToast("请先配置 Supabase 环境变量");
      return;
    }

    const email = cloudEmail.trim();
    if (!email || cloudPassword.length < 6) {
      showToast("请输入邮箱和至少 6 位密码");
      return;
    }

    setCloudSync((current) => ({ ...current, status: "loading", message: mode === "signIn" ? "正在登录..." : "正在注册..." }));
    const result =
      mode === "signIn"
        ? await supabase.auth.signInWithPassword({ email, password: cloudPassword })
        : await supabase.auth.signUp({ email, password: cloudPassword });

    if (result.error) {
      setCloudSync((current) => ({ ...current, status: "error", message: result.error.message }));
      showToast(result.error.message);
      return;
    }

    setCloudUser(result.data.user ?? result.data.session?.user ?? null);
    setCloudPassword("");
    setCloudSync((current) => ({
      ...current,
      status: "ready",
      message: mode === "signIn" ? "登录成功" : "注册成功，请按邮箱提示确认",
    }));
    showToast(mode === "signIn" ? "云同步已登录" : "注册成功");
  };

  const handleCloudSignOut = async () => {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setCloudUser(null);
    setCloudPassword("");
    setCloudSync((current) => ({ ...current, status: "idle", message: "已退出云同步" }));
  };

  const uploadCloudSnapshot = async () => {
    if (!supabase) {
      showToast("请先配置 Supabase");
      return;
    }

    if (!cloudUser) {
      showToast("请先登录云同步");
      return;
    }

    const updatedAt = new Date().toISOString();
    setCloudSync((current) => ({ ...current, status: "loading", message: "正在上传云端..." }));
    const payload = { events, plans, updatedAt };
    const { error } = await supabase.from(cloudSnapshotTable).upsert(
      {
        user_id: cloudUser.id,
        data: payload,
        updated_at: updatedAt,
      },
      { onConflict: "user_id" },
    );

    if (error) {
      setCloudSync((current) => ({ ...current, status: "error", message: error.message }));
      showToast(error.message);
      return;
    }

    setStoredLocalUpdatedAt(updatedAt);
    setCloudSync({ status: "ready", message: "已上传到云端", cloudUpdatedAt: updatedAt, localUpdatedAt: updatedAt });
    showToast("已上传到云端");
  };

  const restoreCloudSnapshot = async () => {
    if (!supabase) {
      showToast("请先配置 Supabase");
      return;
    }

    if (!cloudUser) {
      showToast("请先登录云同步");
      return;
    }

    setCloudSync((current) => ({ ...current, status: "loading", message: "正在读取云端..." }));
    const { data, error } = await supabase.from(cloudSnapshotTable).select("data, updated_at").eq("user_id", cloudUser.id).maybeSingle();
    if (error) {
      setCloudSync((current) => ({ ...current, status: "error", message: error.message }));
      showToast(error.message);
      return;
    }

    const snapshot = normalizeSnapshotPayload(data?.data);
    if (!snapshot) {
      setCloudSync((current) => ({ ...current, status: "idle", message: "云端暂无备份" }));
      showToast("云端暂无备份");
      return;
    }

    setEvents(snapshot.events);
    setPlans(snapshot.plans);
    const updatedAt = typeof data?.updated_at === "string" ? data.updated_at : snapshot.updatedAt || new Date().toISOString();
    setStoredLocalUpdatedAt(updatedAt);
    setCloudSync({ status: "ready", message: "已从云端恢复", cloudUpdatedAt: updatedAt, localUpdatedAt: updatedAt });
    showToast("已从云端恢复");
  };

  const requestNotifications = () => {
    if (!("Notification" in window)) {
      showToast("当前浏览器不支持系统提醒");
      return;
    }

    Notification.requestPermission().then((permission) => {
      showToast(permission === "granted" ? "提醒已启用" : "提醒未授权");
    });
  };

  const showingToday = currentYear === today.getFullYear() && currentMonth === today.getMonth() && selectedDate === todayStr;
  const monthTitleText =
    calendarPickerMode === "years"
      ? `${yearPageStart} - ${yearPageStart + 11}`
      : calendarPickerMode === "months"
        ? `${currentYear}年`
        : `${currentYear}年${currentMonth + 1}月`;
  const prevLabel = calendarPickerMode === "years" ? "上一组年份" : calendarPickerMode === "months" ? "上一年" : "上个月";
  const nextLabel = calendarPickerMode === "years" ? "下一组年份" : calendarPickerMode === "months" ? "下一年" : "下个月";

  return (
    <main className="calendar-app">
      <section className="app-container" aria-label="日历应用">
        <header className="nav-header">
          <button className="btn-today" type="button" disabled={showingToday} onClick={goToday}>
            今天
          </button>

          <div className="month-nav">
            <button className="btn-icon" type="button" aria-label={prevLabel} onClick={() => changeCalendarPeriod(-1)}>
              <ChevronLeft size={20} />
            </button>
            <button className="month-title" type="button" onClick={cycleCalendarPicker}>
              {monthTitleText}
            </button>
            <button className="btn-icon" type="button" aria-label={nextLabel} onClick={() => changeCalendarPeriod(1)}>
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="header-actions">
            <button className="btn-icon" type="button" aria-label="搜索事件" onClick={() => setActiveSheet("search")}>
              <Search size={19} />
            </button>
            <button className="btn-icon" type="button" aria-label="导入导出" onClick={() => setActiveSheet("tools")}>
              <Upload size={18} />
            </button>
            <button className="btn-add-header" type="button" aria-label="添加事件" onClick={() => openAddSheet()}>
              <Plus size={22} />
            </button>
          </div>
        </header>

        <nav className="view-tabs" aria-label="视图切换">
          <button className={activeView === "calendar" ? "active" : ""} type="button" onClick={() => setActiveView("calendar")}>
            <CalendarDays size={16} />
            日历
          </button>
          <button
            className={activeView === "dashboard" ? "active" : ""}
            type="button"
            onClick={() => {
              setActiveView("dashboard");
              setCalendarPickerMode("days");
            }}
          >
            <LayoutDashboard size={16} />
            仪表盘
          </button>
          <button
            className={activeView === "plans" ? "active" : ""}
            type="button"
            onClick={() => {
              setActiveView("plans");
              setCalendarPickerMode("days");
            }}
          >
            <ListTodo size={16} />
            计划
          </button>
        </nav>

        {activeView === "calendar" ? (
          <>
            {calendarPickerMode === "days" ? (
              <>
                <div className="weekday-row" aria-hidden="true">
                  <span className="weekend">日</span>
                  <span>一</span>
                  <span>二</span>
                  <span>三</span>
                  <span>四</span>
                  <span>五</span>
                  <span className="weekend">六</span>
                </div>

                <div
                  className={`calendar-grid-wrapper ${isDayPanelWeekMode ? "week-mode" : ""}`}
                  onClick={() => {
                    if (dayPanelExpanded) {
                      setDayPanelExpanded(false);
                    }
                  }}
                >
                  <div className={`calendar-grid ${isDayPanelWeekMode ? "week-mode" : ""}`}>
                    {displayCalendarCells.map((cell) => {
                      const dayOccurrences = occurrencesByDate[cell.dateStr] ?? [];
                      const dayDeadlines = deadlinesByDate[cell.dateStr] ?? [];
                      const colors = Array.from(new Set(dayOccurrences.map((occurrence) => getCategory(occurrence.event.calendarId).color)));
                      const isSelected = selectedDate === cell.dateStr;
                      const isToday = cell.dateStr === todayStr;

                      return (
                        <button
                          className={[
                            "day-cell",
                            cell.isOtherMonth ? "other-month" : "",
                            isSelected ? "selected" : "",
                            isToday ? "today" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          key={cell.dateStr}
                          type="button"
                          onClick={() => selectDate(cell.dateStr)}
                        >
                          <span className="day-number">{cell.date.getDate()}</span>
                          <span className="lunar-label">{cell.lunar}</span>
                          {dayDeadlines.length > 0 ? (
                            <span className="deadline-marker" aria-label={`${dayDeadlines.length} 个计划截止`}>
                              截
                            </span>
                          ) : null}
                          <span className="event-dots" aria-hidden="true">
                            {colors.slice(0, 3).map((color) => (
                              <span className="event-dot" key={color} style={{ backgroundColor: color }} />
                            ))}
                            {colors.length > 3 ? <span className="event-dot-more">…</span> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : null}

            {calendarPickerMode === "months" ? (
              <div className="calendar-picker-wrapper">
                <div className="month-picker-grid">
                  {Array.from({ length: 12 }, (_, month) => {
                    const monthStart = getDateStr(new Date(currentYear, month, 1));
                    const monthEnd = getDateStr(new Date(currentYear, month + 1, 0));
                    const monthEventCount = expandOccurrences(events, monthStart, monthEnd).length;
                    const monthDeadlineCount = plans.filter((plan) => plan.endDate >= monthStart && plan.endDate <= monthEnd).length;
                    const isCurrentMonth = currentYear === today.getFullYear() && month === today.getMonth();
                    const isActiveMonth = month === currentMonth;

                    return (
                      <button
                        className={["month-picker-cell", isActiveMonth ? "selected" : "", isCurrentMonth ? "today" : ""]
                          .filter(Boolean)
                          .join(" ")}
                        key={month}
                        type="button"
                        onClick={() => selectMonthFromPicker(month)}
                      >
                        <strong>{month + 1}月</strong>
                        <span>
                          {monthEventCount} 事件 · {monthDeadlineCount} 截止
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {calendarPickerMode === "years" ? (
              <div className="calendar-picker-wrapper">
                <div className="year-picker-grid">
                  {yearsInPicker.map((year) => {
                    const isCurrentYear = year === today.getFullYear();
                    const isActiveYear = year === currentYear;
                    const yearPlanCount = plans.filter((plan) => parseDateStr(plan.endDate).getFullYear() === year).length;

                    return (
                      <button
                        className={["year-picker-cell", isActiveYear ? "selected" : "", isCurrentYear ? "today" : ""]
                          .filter(Boolean)
                          .join(" ")}
                        key={year}
                        type="button"
                        onClick={() => selectYearFromPicker(year)}
                      >
                        <strong>{year}</strong>
                        <span>{yearPlanCount} 截止</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <section className={`bottom-panel ${dayPanelExpanded ? "expanded" : ""}`} aria-label="所选日期事件">
              <button
                className="panel-handle"
                type="button"
                aria-label={dayPanelExpanded ? "收起单日事项" : "展开单日事项"}
                aria-expanded={dayPanelExpanded}
                onClick={handlePanelHandleClick}
                onPointerDown={handlePanelHandlePointerDown}
                onPointerMove={handlePanelHandlePointerMove}
                onPointerUp={handlePanelHandlePointerUp}
                onPointerCancel={handlePanelHandlePointerUp}
              />
              <div className="panel-header">
                <div>
                  <h2>{selectedDate ? formatPanelDate(selectedDate) : "选择日期"}</h2>
                  {selectedDate ? <p>{formatLunarDate(parseDateStr(selectedDate))}</p> : null}
                </div>
                <div className="panel-side-info">
                  {selectedDate === todayStr ? (
                    <button
                      className={`weather-card ${weatherInfo.status}`}
                      type="button"
                      onClick={loadWeather}
                      aria-label="刷新今日天气"
                    >
                      {weatherInfo.status === "loading" ? <RefreshCw className="weather-spin" size={18} /> : <CloudSun size={19} />}
                      <span>
                        <strong>
                          {weatherInfo.status === "ready"
                            ? `${formatWeatherValue(weatherInfo.temperature)} ${weatherInfo.condition}`
                            : weatherInfo.status === "error"
                              ? "天气不可用"
                              : "获取天气"}
                        </strong>
                        <small>
                          {weatherInfo.status === "ready"
                            ? `${weatherInfo.locationLabel}${weatherInfo.isFallbackLocation ? " · 默认" : ""} · ${formatWeatherValue(
                                weatherInfo.low,
                              )}/${formatWeatherValue(weatherInfo.high)} · 降雨${formatWeatherValue(
                                weatherInfo.precipitationProbability,
                                "%",
                              )}`
                            : weatherInfo.status === "loading"
                              ? "正在更新"
                              : "点击重试"}
                        </small>
                      </span>
                    </button>
                  ) : null}
                  {selectedDate === todayStr ? <span className="panel-date-badge">今天</span> : null}
                </div>
              </div>

              <div className="panel-content">
                {!selectedDate ? (
                  <div className="panel-empty">
                    <CalendarDays size={34} />
                    <span>选择日期查看事件</span>
                  </div>
                ) : selectedOccurrences.length === 0 && selectedDeadlines.length === 0 ? (
                  <>
                    <div className="panel-empty">
                      <CalendarDays size={34} />
                      <span>这一天没有事件</span>
                    </div>
                    <button className="btn-add-panel" type="button" onClick={() => openAddSheet(selectedDate)}>
                      <Plus size={17} />
                      添加事件
                    </button>
                  </>
                ) : (
                  <>
                    {selectedDeadlines.length > 0 ? (
                      <div className="deadline-list">
                        <div className="deadline-section-title">
                          <Target size={15} />
                          <span>{selectedDate === todayStr ? "今日计划 Deadline" : "计划 Deadline"}</span>
                        </div>
                        {selectedDeadlines.map((plan) => (
                          <button className="deadline-item" key={plan.id} type="button" onClick={() => openEditPlanSheet(plan.id)}>
                            <span className="deadline-accent" style={{ backgroundColor: getPlanLevelColor(plan.level) }} />
                            <span className="deadline-info">
                              <strong>{plan.title}</strong>
                              <span>
                                {getPlanLevelLabel(plan.level)} · {getPlanChainLabel(plan, plans)}
                              </span>
                              <em>交付物：{getPlanDeliverable(plan)}</em>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {selectedOccurrences.length > 0 ? (
                    <div className="event-list">
                      {selectedOccurrences.map((occurrence) => {
                        const category = getCategory(occurrence.event.calendarId);
                    const sourceLabel = getPlanSourceLabel(occurrence.event, plans);
                    return (
                      <article className="event-item" key={occurrence.occurrenceKey}>
                            <button className="event-main" type="button" onClick={() => openEditSheet(occurrence.event.id)}>
                              <span className="event-color-indicator" style={{ backgroundColor: category.color }} />
                              <span className="event-info">
                                <strong>{occurrence.event.title}</strong>
                                <span>
                                  {formatTime(occurrence.event)} · {category.name}
                                {occurrence.event.repeatRule !== "none" ? ` · ${getRepeatLabel(occurrence.event.repeatRule)}` : ""}
                              </span>
                                {sourceLabel ? <em>{sourceLabel}</em> : null}
                                {occurrence.event.reminderMinutes !== null ? (
                                  <small>
                                    <Bell size={12} />
                                    {getReminderLabel(occurrence.event.reminderMinutes)}
                                  </small>
                                ) : null}
                              </span>
                            </button>
                            <button
                              className="event-delete-btn"
                              type="button"
                              aria-label={`删除 ${occurrence.event.title}`}
                              onClick={() => deleteEvent(occurrence.event.id)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </article>
                        );
                      })}
                    </div>
                    ) : null}
                    <button className="btn-add-panel" type="button" onClick={() => openAddSheet(selectedDate)}>
                      <Plus size={17} />
                      添加事件
                    </button>
                  </>
                )}
              </div>
            </section>
          </>
        ) : null}

        {activeView === "dashboard" ? (
          <section className="workspace-panel dashboard-view" aria-label="仪表盘">
            <div className="workspace-header">
              <div>
                <h2>仪表盘</h2>
                <p>事件、计划和进度概览</p>
              </div>
              <button className="toolbar-action" type="button" onClick={() => openAddPlanSheet("month")}>
                <Plus size={17} />
                新计划
              </button>
            </div>

            <div className="stat-grid">
              <StatCard icon={<CalendarRange size={20} />} label="未来 7 天" value={`${dashboardStats.thisWeekEvents}`} hint="待处理事件" />
              <StatCard icon={<Target size={20} />} label="总计划" value={`${dashboardStats.plannedCount}`} hint={`${dashboardStats.activePlans} 个进行中`} />
              <StatCard
                icon={<ClipboardList size={20} />}
                label="计划事项"
                value={`${dashboardStats.taskCount}`}
                hint={`${dashboardStats.scheduledTasks} 个已安排`}
              />
              <StatCard
                icon={<BarChart3 size={20} />}
                label="平均进度"
                value={`${dashboardStats.averageProgress}%`}
                hint={`时间 ${dashboardStats.averageTimeProgress}%`}
              />
            </div>

            <section className="dashboard-section">
              <div className="section-title-row">
                <h3>计划甘特图</h3>
                <span>
                  {formatShortDate(ganttTimeline.start)} - {formatShortDate(ganttTimeline.end)}
                </span>
              </div>
              <GanttChart plans={ganttPlans} timeline={ganttTimeline} todayStr={todayStr} onEdit={openEditPlanSheet} />
            </section>

            <section className="dashboard-section split-dashboard">
              <div>
                <div className="section-title-row">
                  <h3>本月分类</h3>
                </div>
                <div className="chart-list">
                  {categoryStats.map((item) => (
                    <MiniBar
                      key={item.category.id}
                      label={item.category.name}
                      value={item.count}
                      color={item.category.color}
                    />
                  ))}
                </div>
              </div>
              <div>
                <div className="section-title-row">
                  <h3>计划结构</h3>
                </div>
                <div className="chart-list">
                  {planCounts.map((item) => (
                    <MiniBar key={item.value} label={item.label} value={item.count} color={getPlanLevelColor(item.value)} />
                  ))}
                </div>
              </div>
            </section>

            <section className="dashboard-section">
              <div className="section-title-row">
                <h3>近期事件</h3>
                <span>{upcomingOccurrences.length} 个</span>
              </div>
              {upcomingOccurrences.length === 0 ? (
                <div className="panel-empty compact">
                  <CalendarRange size={30} />
                  <span>暂无近期事件</span>
                </div>
              ) : (
                <>
                  <div className={`compact-list ${upcomingExpanded ? "expanded" : "collapsed"}`}>
                    {visibleUpcomingOccurrences.map((occurrence) => {
                      const category = getCategory(occurrence.event.calendarId);
                      return (
                        <button
                          className="compact-row"
                          type="button"
                          key={occurrence.occurrenceKey}
                          onClick={() => {
                            selectDate(occurrence.occurrenceDate);
                            setActiveView("calendar");
                          }}
                        >
                          <span style={{ backgroundColor: category.color }} />
                          <strong>{occurrence.event.title}</strong>
                          <small>{formatShortDate(occurrence.occurrenceDate)}</small>
                        </button>
                      );
                    })}
                  </div>
                  {upcomingOccurrences.length > collapsedUpcomingCount ? (
                    <button className="section-toggle" type="button" onClick={() => setUpcomingExpanded((current) => !current)}>
                      {upcomingExpanded ? "收起" : `展开其余 ${hiddenUpcomingCount} 个`}
                    </button>
                  ) : null}
                </>
              )}
            </section>
          </section>
        ) : null}

        {activeView === "plans" ? (
          <section className="workspace-panel plans-view" aria-label="计划">
            <div className="workspace-header">
              <div>
                <h2>计划</h2>
                <p>年计划、月计划、周计划</p>
              </div>
              <button className="toolbar-action" type="button" onClick={() => openAddPlanSheet(planFilter === "all" ? "month" : planFilter)}>
                <Plus size={17} />
                新计划
              </button>
            </div>

            <div className="plan-filter" aria-label="计划类型筛选">
              <button className={planFilter === "all" ? "active" : ""} type="button" onClick={() => setPlanFilter("all")}>
                全部
              </button>
              {planLevelOptions.map((option) => (
                <button
                  className={planFilter === option.value ? "active" : ""}
                  key={option.value}
                  type="button"
                  onClick={() => setPlanFilter(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="plans-list">
              {filteredPlans.length === 0 ? (
                <div className="panel-empty compact">
                  <ClipboardList size={30} />
                  <span>暂无计划</span>
                </div>
              ) : (
                filteredPlans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    plans={plans}
                    todayStr={todayStr}
                    onEdit={openEditPlanSheet}
                    onDelete={deletePlan}
                    onScheduleTask={openScheduleTaskSheet}
                  />
                ))
              )}
            </div>
          </section>
        ) : null}
      </section>

      <div className={`overlay ${activeSheet ? "active" : ""}`} onClick={(event) => event.target === event.currentTarget && closeSheet()}>
        {activeSheet === "event" ? (
          <form className="sheet" onSubmit={handleSaveEvent}>
            <div className="sheet-handle" aria-hidden="true" />
            <div className="sheet-header">
              <h2>{editingEventId ? "编辑事件" : "新建事件"}</h2>
              <button className="btn-icon" type="button" aria-label="关闭" onClick={closeSheet}>
                <X size={19} />
              </button>
            </div>

            <label className="form-group">
              <span className="form-label">标题</span>
              <input
                className="form-input"
                maxLength={100}
                placeholder="事件标题"
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              />
            </label>

            <label className="form-group">
              <span className="form-label">日期</span>
              <input
                className="form-input"
                type="date"
                value={draft.date}
                onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
              />
            </label>

            <div
              className="toggle-row"
              role="button"
              tabIndex={0}
              onClick={() => setDraft((current) => ({ ...current, allDay: !current.allDay }))}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setDraft((current) => ({ ...current, allDay: !current.allDay }));
                }
              }}
            >
              <span>全天事件</span>
              <button
                className={`toggle-switch ${draft.allDay ? "active" : ""}`}
                type="button"
                role="switch"
                aria-checked={draft.allDay}
                onClick={(event) => {
                  event.stopPropagation();
                  setDraft((current) => ({ ...current, allDay: !current.allDay }));
                }}
              />
            </div>

            {!draft.allDay ? (
              <label className="form-group">
                <span className="form-label">时间</span>
                <input
                  className="form-input"
                  type="time"
                  value={draft.time}
                  onChange={(event) => setDraft((current) => ({ ...current, time: event.target.value }))}
                />
              </label>
            ) : null}

            <div className="form-row">
              <label className="form-group">
                <span className="form-label">重复</span>
                <select
                  className="form-input"
                  value={draft.repeatRule}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      repeatRule: event.target.value as RepeatRule,
                      repeatUntil: event.target.value === "none" ? "" : current.repeatUntil,
                    }))
                  }
                >
                  {repeatOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {draft.repeatRule !== "none" ? (
                <label className="form-group">
                  <span className="form-label">结束</span>
                  <input
                    className="form-input"
                    type="date"
                    value={draft.repeatUntil}
                    onChange={(event) => setDraft((current) => ({ ...current, repeatUntil: event.target.value }))}
                  />
                </label>
              ) : null}
            </div>

            <label className="form-group">
              <span className="form-label">提醒</span>
              <select
                className="form-input"
                value={draft.reminderMinutes ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    reminderMinutes: event.target.value === "" ? null : Number(event.target.value),
                  }))
                }
              >
                {reminderOptions.map((option) => (
                  <option key={option.label} value={option.value ?? ""}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="form-group">
              <span className="form-label">日历分类</span>
              <div className="color-options">
                {categories.map((category) => (
                  <button
                    className={`color-option ${draft.calendarId === category.id ? "selected" : ""}`}
                    key={category.id}
                    type="button"
                    onClick={() => setDraft((current) => ({ ...current, calendarId: category.id }))}
                  >
                    <span style={{ backgroundColor: category.color }} />
                    {category.name}
                  </button>
                ))}
              </div>
            </div>

            {draft.planId ? (
              <div className="linked-source-box">
                <CalendarRange size={16} />
                <span>{getPlanSourceLabel(draft as CalendarEvent, plans) || "来自计划事项"}</span>
              </div>
            ) : null}

            <label className="form-group">
              <span className="form-label">备注</span>
              <textarea
                className="form-input"
                maxLength={300}
                placeholder="添加备注"
                rows={3}
                value={draft.notes}
                onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>

            <div className="btn-row">
              <button className="btn btn-secondary" type="button" onClick={closeSheet}>
                取消
              </button>
              <button className="btn btn-primary" type="submit">
                保存
              </button>
            </div>

            {editingEventId ? (
              <button className="btn btn-danger" type="button" onClick={() => deleteEvent(editingEventId)}>
                <Trash2 size={16} />
                删除事件
              </button>
            ) : null}
          </form>
        ) : null}

        {activeSheet === "search" ? (
          <div className="sheet search-sheet">
            <div className="sheet-handle" aria-hidden="true" />
            <div className="sheet-header">
              <h2>搜索事件</h2>
              <button className="btn-icon" type="button" aria-label="关闭" onClick={closeSheet}>
                <X size={19} />
              </button>
            </div>
            <div className="search-box">
              <Search size={18} />
              <input
                autoFocus
                placeholder="标题、备注、分类或日期"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
            <div className="search-results">
              {searchResults.length === 0 ? (
                <div className="panel-empty compact">
                  <Search size={30} />
                  <span>未找到匹配事件</span>
                </div>
              ) : (
                searchResults.map((occurrence) => {
                  const category = getCategory(occurrence.event.calendarId);
                  return (
                    <button
                      className="search-result"
                      key={occurrence.occurrenceKey}
                      type="button"
                      onClick={() => {
                        selectDate(occurrence.occurrenceDate);
                        setActiveView("calendar");
                        closeSheet();
                      }}
                    >
                      <span className="event-color-indicator" style={{ backgroundColor: category.color }} />
                      <span>
                        <strong>{occurrence.event.title}</strong>
                        <small>
                          {formatFullDate(occurrence.occurrenceDate)} · {formatTime(occurrence.event)} · {category.name}
                        </small>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ) : null}

        {activeSheet === "plan" ? (
          <form className="sheet plan-sheet" onSubmit={handleSavePlan}>
            <div className="sheet-handle" aria-hidden="true" />
            <div className="sheet-header">
              <h2>{editingPlanId ? "编辑计划" : "新建计划"}</h2>
              <button className="btn-icon" type="button" aria-label="关闭" onClick={closeSheet}>
                <X size={19} />
              </button>
            </div>

            <label className="form-group">
              <span className="form-label">标题</span>
              <input
                className="form-input"
                maxLength={100}
                placeholder="计划标题"
                value={planDraft.title}
                onChange={(event) => setPlanDraft((current) => ({ ...current, title: event.target.value }))}
              />
            </label>

            <div className="form-row">
              <label className="form-group">
                <span className="form-label">类型</span>
                <select
                  className="form-input"
                  value={planDraft.level}
                  onChange={(event) => {
                    const nextLevel = event.target.value as PlanLevel;
                    setPlanDraft((current) => ({
                      ...current,
                      level: nextLevel,
                      parentPlanId:
                        current.parentPlanId && getAllowedParentLevels(nextLevel).includes(plans.find((plan) => plan.id === current.parentPlanId)?.level ?? "week")
                          ? current.parentPlanId
                          : undefined,
                    }));
                  }}
                >
                  {planLevelOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-group">
                <span className="form-label">状态</span>
                <select
                  className="form-input"
                  value={planDraft.status}
                  onChange={(event) =>
                    setPlanDraft((current) => ({
                      ...current,
                      status: event.target.value as PlanStatus,
                      progress: event.target.value === "done" ? 100 : current.progress,
                    }))
                  }
                >
                  {planStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {getAllowedParentLevels(planDraft.level).length > 0 ? (
              <label className="form-group">
                <span className="form-label">关联上级计划</span>
                <select
                  className="form-input"
                  value={planDraft.parentPlanId ?? ""}
                  onChange={(event) => setPlanDraft((current) => ({ ...current, parentPlanId: event.target.value || undefined }))}
                >
                  <option value="">不关联上级计划</option>
                  {parentPlanOptions.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {getPlanLevelLabel(plan.level)} · {getPlanChainLabel(plan, plans)}
                    </option>
                  ))}
                </select>
                <span className="form-help">
                  {planDraft.level === "month" ? "月计划可以承接年计划。" : "周计划可以承接月计划，也可以直接承接年计划。"}
                </span>
              </label>
            ) : null}

            {editingPlanId && planDraft.level !== "week" ? (
              <div className="form-group">
                <span className="form-label">{getChildPlanLevelLabel(planDraft.level)}</span>
                {childPlansForEditing.length === 0 ? (
                  <div className="panel-empty compact child-plan-empty">
                    <ClipboardList size={26} />
                    <span>{planDraft.level === "year" ? "暂无关联月计划" : "暂无关联周计划"}</span>
                  </div>
                ) : (
                  <div className="child-plan-list">
                    {childPlansForEditing.map((childPlan) => {
                      const progress = getPlanComputedProgress(childPlan);
                      const timeProgress = getPlanTimeProgress(childPlan, todayStr);

                      return (
                        <button className="child-plan-row" key={childPlan.id} type="button" onClick={() => openEditPlanSheet(childPlan.id)}>
                          <span className="child-plan-accent" style={{ backgroundColor: getPlanLevelColor(childPlan.level) }} />
                          <span className="child-plan-info">
                            <strong>{childPlan.title}</strong>
                            <small>
                              {getPlanLevelLabel(childPlan.level)} · {formatShortDate(childPlan.startDate)} - {formatShortDate(childPlan.endDate)}
                            </small>
                            <em>交付物：{getPlanDeliverable(childPlan)}</em>
                          </span>
                          <span className="child-plan-progress">
                            <b>{progress}%</b>
                            <small>{timeProgress}%</small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            <div className="form-row">
              <label className="form-group">
                <span className="form-label">开始</span>
                <input
                  className="form-input"
                  type="date"
                  value={planDraft.startDate}
                  onChange={(event) => setPlanDraft((current) => ({ ...current, startDate: event.target.value }))}
                />
              </label>

              <label className="form-group">
                <span className="form-label">结束</span>
                <input
                  className="form-input"
                  type="date"
                  value={planDraft.endDate}
                  onChange={(event) => setPlanDraft((current) => ({ ...current, endDate: event.target.value }))}
                />
              </label>
            </div>

            <label className="form-group">
              <span className="form-label">完成进度 {planDraft.progress}%</span>
              <input
                className="range-input"
                max="100"
                min="0"
                type="range"
                value={planDraft.progress}
                onChange={(event) =>
                  setPlanDraft((current) => ({
                    ...current,
                    progress: Number(event.target.value),
                    status: Number(event.target.value) >= 100 ? "done" : current.status === "done" ? "doing" : current.status,
                  }))
                }
              />
            </label>

            <div className="form-group">
              <span className="form-label">
                时间进度{" "}
                {typeof planDraft.timeProgressOverride === "number"
                  ? `${clampPercent(planDraft.timeProgressOverride)}%`
                  : `${getPlanAutoTimeProgress(planDraft as PlanItem, todayStr)}% 自动`}
              </span>
              <input
                className="range-input"
                max="100"
                min="0"
                type="range"
                value={
                  typeof planDraft.timeProgressOverride === "number"
                    ? clampPercent(planDraft.timeProgressOverride)
                    : getPlanAutoTimeProgress(planDraft as PlanItem, todayStr)
                }
                onChange={(event) =>
                  setPlanDraft((current) => ({
                    ...current,
                    timeProgressOverride: Number(event.target.value),
                  }))
                }
              />
              <div className="progress-control-row">
                <span>按起止日期每天自动推进，也可以拖动滑杆手动校准。</span>
                {typeof planDraft.timeProgressOverride === "number" ? (
                  <button
                    type="button"
                    onClick={() => setPlanDraft((current) => ({ ...current, timeProgressOverride: undefined }))}
                  >
                    恢复自动
                  </button>
                ) : null}
              </div>
            </div>

            <label className="form-group">
              <span className="form-label">目标</span>
              <input
                className="form-input"
                maxLength={160}
                placeholder="这个计划要达成什么"
                value={planDraft.goal}
                onChange={(event) => setPlanDraft((current) => ({ ...current, goal: event.target.value }))}
              />
            </label>

            <label className="form-group">
              <span className="form-label">交付物</span>
              <input
                className="form-input"
                maxLength={160}
                placeholder="截止日要交付什么"
                value={planDraft.deliverable}
                onChange={(event) => setPlanDraft((current) => ({ ...current, deliverable: event.target.value }))}
              />
            </label>

            <label className="form-group">
              <span className="form-label">备注</span>
              <textarea
                className="form-input"
                maxLength={300}
                placeholder="关键行动、风险或复盘记录"
                rows={3}
                value={planDraft.notes}
                onChange={(event) => setPlanDraft((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>

            <div className="form-group">
              <span className="form-label">事项清单</span>
              <div className="task-input-row">
                <input
                  className="form-input"
                  maxLength={120}
                  placeholder="先写一个可执行事项"
                  value={newPlanTaskTitle}
                  onChange={(event) => setNewPlanTaskTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addPlanTaskToDraft();
                    }
                  }}
                />
                <button className="toolbar-action" type="button" onClick={addPlanTaskToDraft}>
                  <Plus size={16} />
                  添加
                </button>
              </div>
              <div className="task-edit-list">
                {planDraft.tasks.length === 0 ? (
                  <div className="panel-empty compact">
                    <ClipboardList size={28} />
                    <span>先把事项写在计划里，再安排到日历</span>
                  </div>
                ) : (
                  planDraft.tasks.map((task) => (
                    <div className="task-edit-row" key={task.id}>
                      <input
                        className="form-input"
                        value={task.title}
                        onChange={(event) => updatePlanTaskDraft(task.id, { title: event.target.value })}
                      />
                      <select
                        className="form-input"
                        value={task.status}
                        onChange={(event) => updatePlanTaskDraft(task.id, { status: event.target.value as PlanTaskStatus })}
                      >
                        {planTaskStatusOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button className="event-delete-btn" type="button" aria-label={`删除 ${task.title}`} onClick={() => deletePlanTaskFromDraft(task.id)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="btn-row">
              <button className="btn btn-secondary" type="button" onClick={closeSheet}>
                取消
              </button>
              <button className="btn btn-primary" type="submit">
                保存
              </button>
            </div>

            {editingPlanId ? (
              <button className="btn btn-danger" type="button" onClick={() => deletePlan(editingPlanId)}>
                <Trash2 size={16} />
                删除计划
              </button>
            ) : null}
          </form>
        ) : null}

        {activeSheet === "scheduleTask" && scheduleDraft ? (
          <form className="sheet schedule-sheet" onSubmit={handleScheduleTask}>
            <div className="sheet-handle" aria-hidden="true" />
            <div className="sheet-header">
              <h2>安排到日历</h2>
              <button className="btn-icon" type="button" aria-label="关闭" onClick={closeSheet}>
                <X size={19} />
              </button>
            </div>

            <label className="form-group">
              <span className="form-label">事项</span>
              <input
                className="form-input"
                value={scheduleDraft.title}
                onChange={(event) => setScheduleDraft((current) => (current ? { ...current, title: event.target.value } : current))}
              />
            </label>

            <label className="form-group">
              <span className="form-label">日期</span>
              <input
                className="form-input"
                type="date"
                value={scheduleDraft.date}
                onChange={(event) => setScheduleDraft((current) => (current ? { ...current, date: event.target.value } : current))}
              />
            </label>

            <div
              className="toggle-row"
              role="button"
              tabIndex={0}
              onClick={() => setScheduleDraft((current) => (current ? { ...current, allDay: !current.allDay } : current))}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setScheduleDraft((current) => (current ? { ...current, allDay: !current.allDay } : current));
                }
              }}
            >
              <span>全天事项</span>
              <button
                className={`toggle-switch ${scheduleDraft.allDay ? "active" : ""}`}
                type="button"
                role="switch"
                aria-checked={scheduleDraft.allDay}
                onClick={(event) => {
                  event.stopPropagation();
                  setScheduleDraft((current) => (current ? { ...current, allDay: !current.allDay } : current));
                }}
              />
            </div>

            {!scheduleDraft.allDay ? (
              <label className="form-group">
                <span className="form-label">时间</span>
                <input
                  className="form-input"
                  type="time"
                  value={scheduleDraft.time}
                  onChange={(event) => setScheduleDraft((current) => (current ? { ...current, time: event.target.value } : current))}
                />
              </label>
            ) : null}

            <div className="form-row">
              <label className="form-group">
                <span className="form-label">分类</span>
                <select
                  className="form-input"
                  value={scheduleDraft.calendarId}
                  onChange={(event) => setScheduleDraft((current) => (current ? { ...current, calendarId: event.target.value } : current))}
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-group">
                <span className="form-label">提醒</span>
                <select
                  className="form-input"
                  value={scheduleDraft.reminderMinutes ?? ""}
                  onChange={(event) =>
                    setScheduleDraft((current) =>
                      current ? { ...current, reminderMinutes: event.target.value === "" ? null : Number(event.target.value) } : current,
                    )
                  }
                >
                  {reminderOptions.map((option) => (
                    <option key={option.label} value={option.value ?? ""}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="btn-row">
              <button className="btn btn-secondary" type="button" onClick={closeSheet}>
                取消
              </button>
              <button className="btn btn-primary" type="submit">
                安排
              </button>
            </div>
          </form>
        ) : null}

        {activeSheet === "tools" ? (
          <div className="sheet tools-sheet">
            <div className="sheet-handle" aria-hidden="true" />
            <div className="sheet-header">
              <h2>导入导出</h2>
              <button className="btn-icon" type="button" aria-label="关闭" onClick={closeSheet}>
                <X size={19} />
              </button>
            </div>
            <input ref={importInputRef} hidden accept="application/json,.json" type="file" onChange={handleImportFile} />
            <section className="cloud-sync-box" aria-label="云同步">
              <div className="cloud-sync-header">
                <div>
                  <h3>云同步</h3>
                  <p>{cloudSync.message}</p>
                </div>
                {cloudSync.status === "loading" ? <RefreshCw className="weather-spin" size={18} /> : <CloudSun size={18} />}
              </div>
              <div className="sync-meta-grid">
                <span>本地更新：{formatSyncTime(cloudSync.localUpdatedAt)}</span>
                <span>云端更新：{formatSyncTime(cloudSync.cloudUpdatedAt)}</span>
              </div>
              {!supabase ? (
                <div className="sync-help">
                  <strong>请先配置 Supabase</strong>
                  <span>在 .env 中填写 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY 后重新启动本地服务。</span>
                </div>
              ) : cloudUser ? (
                <>
                  <div className="sync-account">
                    <span>{cloudUser.email}</span>
                    <button type="button" onClick={handleCloudSignOut}>
                      退出
                    </button>
                  </div>
                  <div className="sync-actions">
                    <button className="btn btn-primary" type="button" onClick={uploadCloudSnapshot} disabled={cloudSync.status === "loading"}>
                      上传云端
                    </button>
                    <button className="btn btn-secondary" type="button" onClick={restoreCloudSnapshot} disabled={cloudSync.status === "loading"}>
                      从云端恢复
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <label className="form-group">
                    <span className="form-label">邮箱</span>
                    <input
                      className="form-input"
                      type="email"
                      value={cloudEmail}
                      onChange={(event) => setCloudEmail(event.target.value)}
                      placeholder="you@example.com"
                    />
                  </label>
                  <label className="form-group">
                    <span className="form-label">密码</span>
                    <input
                      className="form-input"
                      type="password"
                      value={cloudPassword}
                      onChange={(event) => setCloudPassword(event.target.value)}
                      placeholder="至少 6 位"
                    />
                  </label>
                  <div className="sync-actions">
                    <button
                      className="btn btn-primary"
                      type="button"
                      onClick={() => handleCloudAuth("signIn")}
                      disabled={cloudSync.status === "loading"}
                    >
                      登录
                    </button>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => handleCloudAuth("signUp")}
                      disabled={cloudSync.status === "loading"}
                    >
                      注册
                    </button>
                  </div>
                </>
              )}
            </section>
            <button className="tool-row" type="button" onClick={() => importInputRef.current?.click()}>
              <Upload size={19} />
              <span>导入 JSON</span>
            </button>
            <button className="tool-row" type="button" onClick={handleExportJson}>
              <Download size={19} />
              <span>导出 JSON</span>
            </button>
            <button className="tool-row" type="button" onClick={handleExportIcs}>
              <CalendarDays size={19} />
              <span>导出 ICS</span>
            </button>
            <button className="tool-row" type="button" onClick={requestNotifications}>
              <Bell size={19} />
              <span>启用提醒</span>
            </button>
          </div>
        ) : null}
      </div>

      <div className={`toast ${toast ? "show" : ""}`} role="status">
        {toast}
      </div>
    </main>
  );
}
