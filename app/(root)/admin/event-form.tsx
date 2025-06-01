"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { ControllerRenderProps, UseFormReturn } from "react-hook-form";
import * as z from "zod";
import { format } from "date-fns";
import { CalendarIcon, MapPinIcon, TagIcon, ClockIcon } from "lucide-react";
import { CalendarWithTime, DateTimePicker } from "@/components/ui/calendar-with-time";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";

import {
  Credenza,
  CredenzaTrigger,
  CredenzaContent,
  CredenzaHeader,
  CredenzaTitle,
  CredenzaBody,
  CredenzaFooter,
  CredenzaClose,
} from "@/components/ui/credenza";

// Assuming these are exported from your schema
import type { SEventInsert } from "@/db/schema";
import { eventStateEnum } from "@/db/schema";

// Zod schema for form validation (maps to current SEventInsert, excluding auto-generated fields)
const eventFormSchema = z.object({
  name: z.string().min(1, "Event name is required").max(255),
  codeName: z.string().min(1, "Code name is required").max(50),
  description: z.string().max(1000),
  tags: z.string().max(500, "Tags too long"),
  venue: z.string().max(255),
  state: z.enum(eventStateEnum.enumValues as [string, ...string[]]),
  slowModeSeconds: z.coerce.number().min(0).max(3600),
  isPublic: z.boolean(),
  startTime: z.date({ required_error: "Start time is required" }),
  reportingTime: z.date().optional(),
  endTime: z.date({ required_error: "End time is required" }),
  isActive: z.boolean(),
}).refine(
  (data) => {
    if (data.endTime && data.startTime) {
      return data.endTime > data.startTime;
    }
    return true;
  },
  {
    message: "End time must be after start time",
    path: ["endTime"],
  }
).refine(
  (data) => {
    if (data.reportingTime && data.startTime) {
      return data.reportingTime <= data.startTime;
    }
    return true;
  },
  {
    message: "Reporting time must be before or equal to start time",
    path: ["reportingTime"],
  }
);

type EventFormValues = z.infer<typeof eventFormSchema>;

function ReportingTimeField({
  field,
  form,
}: {
  field: ControllerRenderProps<EventFormValues, "reportingTime">;
  form: UseFormReturn<EventFormValues>;
}) {
  const [hour, setHour] = React.useState(field.value ? field.value.getHours() : 9);
  const [minute, setMinute] = React.useState(field.value ? field.value.getMinutes() : 0);

  React.useEffect(() => {
    if (!field.value) {
      setHour(9);
      setMinute(0);
      return;
    }

    setHour(field.value.getHours());
    setMinute(field.value.getMinutes());
  }, [field.value]);

  const updateReportingTime = React.useCallback(
    (newHour: number, newMinute: number) => {
      const startTime = form.getValues("startTime");
      if (!startTime) return;

      const newDate = new Date(startTime);
      newDate.setHours(newHour, newMinute, 0, 0);
      field.onChange(newDate);
    },
    [field, form]
  );

  return (
    <FormItem>
      <FormLabel>Reporting Time (Optional)</FormLabel>
      <FormDescription>Arrival/check-in time. Uses the same date as start time.</FormDescription>
      <div className="flex items-center gap-2 max-w-xs">
        <Input
          type="number"
          value={hour}
          onChange={(e) => {
            const newHour = Math.max(0, Math.min(23, parseInt(e.target.value) || 0));
            setHour(newHour);
            updateReportingTime(newHour, minute);
          }}
          placeholder="HH"
          className="w-16 text-center"
          min={0}
          max={23}
        />
        <span className="text-muted-foreground">:</span>
        <Input
          type="number"
          value={minute}
          onChange={(e) => {
            const newMinute = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
            setMinute(newMinute);
            updateReportingTime(hour, newMinute);
          }}
          placeholder="MM"
          className="w-16 text-center"
          min={0}
          max={59}
        />
        <ClockIcon className="h-4 w-4 text-muted-foreground" />
      </div>
      <FormMessage />
    </FormItem>
  );
}

export function EventForm({
  defaultValues,
  onSubmit,
  trigger,
}: {
  defaultValues?: Partial<EventFormValues>;
  onSubmit?: (values: EventFormValues) => Promise<void>;
  trigger?: React.ReactNode;
}) {
  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      description: "",
      tags: "",
      venue: "",
      state: "scheduled",
      slowModeSeconds: 0,
      isPublic: true,
      isActive: true,
      ...defaultValues,
    },
  });

  const [open, setOpen] = React.useState(false);

  const handleSubmit = async (values: EventFormValues) => {
    try {
      // Prepare data for DB insert (map to current SEventInsert)
      const insertData: Omit<SEventInsert, "id" | "createdAt"> = {
        name: values.name,
        codeName: values.codeName.toLowerCase().replace(/\s+/g, "-"),
        description: values.description,
        tags: values.tags,
        venue: values.venue,
        slowModeSeconds: Number(values.slowModeSeconds),
        isPublic: Boolean(values.isPublic),
        isActive: Boolean(values.isActive),
        state: values.state as typeof eventStateEnum.enumValues[number],
        startTime: values.startTime,
        reportingTime: values.reportingTime || null,
        endTime: values.endTime,
      };

      if (onSubmit) {
        await onSubmit(values);
      } else {
        // Placeholder: Integrate with your API or server action here
        console.log("Create event:", insertData);
        toast.success("Event created", {
          description: `Event "${values.name}" has been scheduled.`,
        });
      }

      form.reset();
      setOpen(false);
    } catch (error) {
      toast.error("Error", {
        description: "Failed to create event. Please try again.",
      });
    }
  };

  return (
    <Credenza open={open} onOpenChange={setOpen}>
      {trigger ? (
        <CredenzaTrigger asChild>{trigger}</CredenzaTrigger>
      ) : (
        <CredenzaTrigger asChild>
          <Button>
            <CalendarIcon className="mr-2 h-4 w-4" />
            Create Event
          </Button>
        </CredenzaTrigger>
      )}
      <CredenzaContent className="w-[95vw] max-w-2xl">
        <CredenzaHeader>
          <CredenzaTitle>Create New Event</CredenzaTitle>
        </CredenzaHeader>
        <CredenzaBody className="max-h-[80vh] overflow-y-auto">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Basic Information</h3>
                <div className="grid grid-cols-1 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Event Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Tech Meetup 2025" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="codeName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Code Name (Unique)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., tech-meetup-2025" {...field} />
                        </FormControl>
                        <FormDescription>Used for internal referencing.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Event details..."
                        className="min-h-[80px] resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Location and Tags */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Location & Tags</h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="venue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Venue</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Online via Zoom" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="tags"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tags</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., tech, ai, meetup"
                            onChange={(e) => field.onChange(e.target.value)}
                            value={field.value}
                          />
                        </FormControl>
                        <FormDescription>Comma-separated tags.</FormDescription>
                        <FormMessage />
                        {field.value && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {field.value.split(",").map((tag, i) => (
                              <Badge key={i} variant="secondary">
                                {tag.trim()}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <Separator />

              {/* Date and Time Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Schedule</h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="startTime"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel>Start Date & Time</FormLabel>
                        <FormControl>
                          <DateTimePicker
                            date={field.value}
                            setDate={field.onChange}
                            className="w-full"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endTime"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel>End Date & Time</FormLabel>
                        <FormControl>
                          <DateTimePicker
                            date={field.value}
                            setDate={field.onChange}
                            className="w-full"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Time-only input for reporting time */}
                <FormField
                  control={form.control}
                  name="reportingTime"
                  render={({ field }) => <ReportingTimeField field={field} form={form} />}
                />
              </div>

              <Separator />

              {/* Settings Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Settings</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="slowModeSeconds"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Slow Mode (seconds)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="0"
                            {...field}
                            onChange={(e) => field.onChange(e.target.valueAsNumber)}
                          />
                        </FormControl>
                        <FormDescription>Delay between messages.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Initial State</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select state" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {eventStateEnum.enumValues.map((state) => (
                              <SelectItem key={state} value={state}>
                                {state.charAt(0).toUpperCase() + state.slice(1)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Checkboxes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="isPublic"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="font-normal">Public Event</FormLabel>
                          <FormDescription>Open to all users.</FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="font-normal">Active Event</FormLabel>
                          <FormDescription>Whether the event is currently active.</FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </form>
          </Form>
        </CredenzaBody>
        <CredenzaFooter>
          <CredenzaClose asChild>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </CredenzaClose>
          <Button type="submit" onClick={form.handleSubmit(handleSubmit)}>
            Create Event
          </Button>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  );
}