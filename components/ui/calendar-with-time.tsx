"use client";

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface CalendarWithTimeProps {
  date: Date | undefined;
  setDate: (date: Date | undefined) => void;
  className?: string;
}

export function CalendarWithTime({
  date,
  setDate,
  className,
}: CalendarWithTimeProps) {
  const [viewDate, setViewDate] = React.useState<Date>(
    date ?? new Date()
  );
  const [hour, setHour] = React.useState(0);
  const [minute, setMinute] = React.useState(0);

  // Sync initial values from date prop
  React.useEffect(() => {
    if (date) {
      setViewDate(date);
      setHour(date.getHours());
      setMinute(date.getMinutes());
    } else {
      const now = new Date();
      setViewDate(now);
      setHour(now.getHours());
      setMinute(now.getMinutes());
    }
  }, [date]);

  const updateDate = React.useCallback(() => {
    const newDate = new Date(
      viewDate.getFullYear(),
      viewDate.getMonth(),
      viewDate.getDate(),
      hour,
      minute
    );
    setDate(newDate);
  }, [viewDate, hour, minute, setDate]);

  // Update on hour/minute change
  React.useEffect(() => {
    if (date) {
      updateDate();
    }
  }, [hour, minute, updateDate, date]);

  const onCalendarSelect = React.useCallback(
    (selectedDate: Date | undefined) => {
      if (selectedDate) {
        setViewDate(selectedDate);
        setDate(
          new Date(
            selectedDate.getFullYear(),
            selectedDate.getMonth(),
            selectedDate.getDate(),
            hour,
            minute
          )
        );
      }
    },
    [hour, minute, setDate]
  );

  const currentMonth = viewDate.getMonth();
  const currentYear = viewDate.getFullYear();

  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const years = Array.from(
    { length: 21 },
    (_, i) => currentYear - 10 + i
  );

  const goToPrevMonth = () => {
    setViewDate(
      new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1)
    );
  };

  const goToNextMonth = () => {
    setViewDate(
      new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1)
    );
  };

  const handleMonthChange = (month: string) => {
    const monthIndex = months.indexOf(month);
    if (monthIndex !== -1) {
      setViewDate(
        new Date(viewDate.getFullYear(), monthIndex, viewDate.getDate())
      );
    }
  };

  const handleYearChange = (year: string) => {
    const yearNum = parseInt(year, 10);
    setViewDate(
      new Date(yearNum, viewDate.getMonth(), viewDate.getDate())
    );
  };

  return (
    <div className={cn("rounded-md border p-3", className)}>
      {/* Header with navigation and selects */}
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="outline"
          size="icon"
          onClick={goToPrevMonth}
          className="h-8 w-8"
        >
          <span className="sr-only">Previous month</span>
          <CalendarIcon className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-2">
          <Select value={months[currentMonth]} onValueChange={handleMonthChange}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Select month" />
            </SelectTrigger>
            <SelectContent>
              {months.map((month) => (
                <SelectItem key={month} value={month}>
                  {month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={currentYear.toString()} onValueChange={handleYearChange}>
            <SelectTrigger className="w-24">
              <SelectValue placeholder="Select year" />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={goToNextMonth}
          className="h-8 w-8"
        >
          <span className="sr-only">Next month</span>
          <CalendarIcon className="h-4 w-4 rotate-180" />
        </Button>
      </div>

      {/* Calendar Grid */}
      <Calendar
        mode="single"
        selected={date}
        onSelect={onCalendarSelect}
        initialFocus={false}
        className="rounded-md border-0 shadow-none"
        fromDate={new Date(2000, 0, 1)}
        toDate={new Date(2100, 11, 31)}
        defaultMonth={viewDate}
      />

      {/* Time Section */}
      <div className="flex items-center justify-between pt-4 mt-4 border-t">
        <span className="text-muted-foreground text-sm">24H Format</span>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={hour}
            onChange={(e) => setHour(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
            placeholder="HH"
            className="w-16 h-8 text-sm text-center"
            min={0}
            max={23}
          />
          <span className="text-muted-foreground">:</span>
          <Input
            type="number"
            value={minute}
            onChange={(e) => setMinute(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
            placeholder="MM"
            className="w-16 h-8 text-sm text-center"
            min={0}
            max={59}
          />
        </div>
      </div>
    </div>
  );
}

// Wrapper for Popover usage in forms
export function DateTimePicker({
  date,
  setDate,
  className,
}: {
  date: Date | undefined;
  setDate: (date: Date | undefined) => void;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !date && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "PPPppp") : <span>Pick a date & time</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <CalendarWithTime date={date} setDate={setDate} />
      </PopoverContent>
    </Popover>
  );
}