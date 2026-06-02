/**
 * Copyright (C) 2025 Xiaomi Corporation
 * This software may be used and distributed according to the terms of the Xiaomi Miloco License Agreement.
 */



/**
 * rule form tool function
 * handle time conversion, cron expression etc.
 */

// trigger period options (labels overridden with i18n in RuleForm)
export const TRIGGER_PERIOD_OPTIONS = [
  { label: '全天', value: 'all_day' },
  { label: '白天(早6晚6)', value: 'daytime' },
  { label: '晚上(晚6点0分01秒-第二天早5点59分59秒)', value: 'nighttime' },
  { label: '自定义', value: 'custom' },
];

export const CUSTOM_PERIOD_PREFIX = 'custom:';

export const TRIGGER_PERIOD_TIME_OPTIONS = {
  hours: Array.from({ length: 24 }, (_, i) => ({ label: `${i}时`, value: i })),
  minutes: Array.from({ length: 60 }, (_, i) => ({ label: `${i}分`, value: i })),
};

// trigger interval options (hour, minute, second)
export const TRIGGER_INTERVAL_OPTIONS = {
  hours: Array.from({ length: 24 }, (_, i) => ({ label: `${i}小时`, value: i })),
  minutes: Array.from({ length: 60 }, (_, i) => ({ label: `${i}分钟`, value: i })),
  seconds: Array.from({ length: 60 }, (_, i) => ({ label: `${i}秒`, value: i })),
};


/**
 * trigger period conversion tool
 */
export const triggerPeriodUtils = {
  padTimePart: (value) => String(value).padStart(2, '0'),

  customTimeToPeriod: (startHour, startMinute, endHour, endMinute) => {
    const pad = triggerPeriodUtils.padTimePart;
    return `${CUSTOM_PERIOD_PREFIX}${pad(startHour)}:${pad(startMinute)}-${pad(endHour)}:${pad(endMinute)}`;
  },

  parseCustomPeriod: (period) => {
    if (!period || !period.startsWith(CUSTOM_PERIOD_PREFIX)) {
      return null;
    }

    const body = period.slice(CUSTOM_PERIOD_PREFIX.length);
    const dashIndex = body.indexOf('-');
    if (dashIndex <= 0) {
      return null;
    }

    const startStr = body.slice(0, dashIndex);
    const endStr = body.slice(dashIndex + 1);
    const parsePart = (timeStr) => {
      const parts = timeStr.split(':');
      if (parts.length !== 2) {
        return null;
      }
      const hour = Number(parts[0]);
      const minute = Number(parts[1]);
      if (
        Number.isNaN(hour) || Number.isNaN(minute) ||
        hour < 0 || hour > 23 || minute < 0 || minute > 59
      ) {
        return null;
      }
      return { hour, minute };
    };

    const start = parsePart(startStr);
    const end = parsePart(endStr);
    if (!start || !end) {
      return null;
    }

    return {
      startHour: start.hour,
      startMinute: start.minute,
      endHour: end.hour,
      endMinute: end.minute,
    };
  },

  periodToFilterValue: (period, customTimes = null) => {
    if (period === 'custom' && customTimes) {
      const {
        startHour = 0,
        startMinute = 0,
        endHour = 23,
        endMinute = 59,
      } = customTimes;
      return triggerPeriodUtils.customTimeToPeriod(
        startHour, startMinute, endHour, endMinute,
      );
    }
    return triggerPeriodUtils.periodToCron(period);
  },

  filterValueToPeriod: (filterValue) => {
    if (!filterValue) {
      return { triggerPeriod: 'all_day' };
    }

    const custom = triggerPeriodUtils.parseCustomPeriod(filterValue);
    if (custom) {
      return {
        triggerPeriod: 'custom',
        triggerPeriodStartHour: custom.startHour,
        triggerPeriodStartMinute: custom.startMinute,
        triggerPeriodEndHour: custom.endHour,
        triggerPeriodEndMinute: custom.endMinute,
      };
    }

    const preset = triggerPeriodUtils.cronToPeriod(filterValue);
    return {
      triggerPeriod: preset || 'all_day',
    };
  },

  periodToCron: (period) => {
    switch (period) {
      case 'all_day':
        return '* * * * *';
      case 'daytime':
        return '* 6-17 * * *';
      case 'nighttime':
        return '* 18-23,0-5 * * *';
      default:
        return '';
    }
  },

  cronToPeriod: (cron) => {
    if (!cron) {return '';}

    try {
      const parts = cron.split(' ');
      if (parts.length !== 5) {return '';}

      const [minute, hour, day, month, weekday] = parts;

      // check if it is all day
      if (minute === '*' && hour === '*' && day === '*' && month === '*' && weekday === '*') {
        return 'all_day';
      }

      // check if it is daytime (6:00-17:59)
      if (minute === '*' && hour === '6-17' && day === '*' && month === '*' && weekday === '*') {
        return 'daytime';
      }

      // check if it is nighttime (18:00-23:59, 0:00-5:59)
      if (minute === '*' && hour === '18-23,0-5' && day === '*' && month === '*' && weekday === '*') {
        return 'nighttime';
      }

      // if not match any preset, return empty string
      return '';
    } catch (error) {
      console.error('Invalid cron expression:', error);
      return '';
    }
  },

  // get period option display text
  getPeriodLabel: (value) => {
    const option = TRIGGER_PERIOD_OPTIONS.find(opt => opt.value === value);
    return option ? option.label : '';
  },
};

/**
 * trigger interval conversion tool
 */
export const triggerIntervalUtils = {
  // convert time selector value to seconds
  timeToSeconds: (hours = 0, minutes = 0, seconds = 0) => {
    return hours * 3600 + minutes * 60 + seconds;
  },

  // convert seconds to time selector value
  secondsToTime: (totalSeconds) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return { hours, minutes, seconds };
  },

  // validate time selector value
  validateTime: (hours, minutes, seconds) => {
    return hours >= 0 && hours <= 23 &&
           minutes >= 0 && minutes <= 59 &&
           seconds >= 0 && seconds <= 59;
  },
};

/**
 * trigger frequency conversion tool
 */
export const triggerFrequencyUtils = {
  // convert frequency selector value to object
  timeToFrequencyObject: (periodHours = 0, periodMinutes = 0, periodSeconds = 0, frequency = 1) => {
    console.log('periodHours', periodHours, periodMinutes, periodSeconds, frequency);
    const period = triggerIntervalUtils.timeToSeconds(periodHours, periodMinutes, periodSeconds);
    return {
      frequency: Math.min(frequency, 99),
      period: period,
    };
  },

  // convert object to frequency selector value
  frequencyObjectToTime: (obj) => {
    if (!obj || typeof obj.frequency !== 'number' || typeof obj.period !== 'number') {
      return { periodHours: 0, periodMinutes: 0, periodSeconds: 0, frequency: 1 };
    }

    const time = triggerIntervalUtils.secondsToTime(obj.period);
    return {
      periodHours: time.hours,
      periodMinutes: time.minutes,
      periodSeconds: time.seconds,
      frequency: Math.min(obj.frequency, 99),
    };
  },

  // validate frequency selector value
  validateFrequency: (periodHours, periodMinutes, periodSeconds, frequency) => {
    const isValidTime = triggerIntervalUtils.validateTime(periodHours, periodMinutes, periodSeconds);
    const isValidFrequency = frequency >= 1 && frequency <= 99;
    return isValidTime && isValidFrequency;
  },
};

/**
 * form data conversion tool
 */
export const formDataUtils = {
  // convert form data to submit format
  toSubmitFormat: (formData) => {
    const {
      triggerPeriod,
      triggerPeriodStartHour,
      triggerPeriodStartMinute,
      triggerPeriodEndHour,
      triggerPeriodEndMinute,
      triggerIntervalHours,
      triggerIntervalMinutes,
      triggerIntervalSeconds,
      ...otherData
    } = formData;

    const periodValue = triggerPeriod
      ? triggerPeriodUtils.periodToFilterValue(triggerPeriod, {
        startHour: triggerPeriodStartHour ?? 0,
        startMinute: triggerPeriodStartMinute ?? 0,
        endHour: triggerPeriodEndHour ?? 23,
        endMinute: triggerPeriodEndMinute ?? 59,
      })
      : triggerPeriodUtils.periodToCron('all_day');

    return {
      ...otherData,
      period: periodValue || triggerPeriodUtils.periodToCron('all_day'),

      interval: triggerIntervalUtils.timeToSeconds(
        triggerIntervalHours || 0,
        triggerIntervalMinutes || 0,
        triggerIntervalSeconds
      ),
    };
  },

  // convert backend data to form format
  toFormFormat: (backendData) => {
    const {
      period,
      interval,
      // frequency,
      ...otherData
    } = backendData;

    const intervalTime = triggerIntervalUtils.secondsToTime(interval || 2);
    const periodFields = triggerPeriodUtils.filterValueToPeriod(period);

    return {
      ...otherData,
      ...periodFields,
      triggerIntervalHours: intervalTime.hours,
      triggerIntervalMinutes: intervalTime.minutes,
      triggerIntervalSeconds: intervalTime.seconds,
    };
  },
};

