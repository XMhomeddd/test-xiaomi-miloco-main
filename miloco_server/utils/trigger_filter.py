# Copyright (C) 2025 Xiaomi Corporation
# This software may be used and distributed according to the terms of the Xiaomi Miloco License Agreement.

"""
Rule trigger filter utility for managing trigger frequency and conditions.
Provides functionality to filter trigger rules based on frequency, period, and condition changes.
"""

import datetime
import logging
from collections import deque
from typing import Dict, OrderedDict

from croniter import croniter

from miloco_server.schema.trigger_schema import TriggerRule, TriggerFrequencyFilter

logger = logging.getLogger(name=__name__)

_CUSTOM_PERIOD_PREFIX = "custom:"


def _parse_time_part(time_str: str) -> tuple[int, int]:
    """Parse HH:MM into (hour, minute)."""
    parts = time_str.strip().split(":")
    if len(parts) != 2:
        raise ValueError(f"Invalid time part: {time_str}")
    hour, minute = int(parts[0]), int(parts[1])
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        raise ValueError(f"Invalid time value: {time_str}")
    return hour, minute


def _time_to_seconds(hour: int, minute: int, second: int = 0) -> int:
    return hour * 3600 + minute * 60 + second


def match_custom_period(period: str, dt: datetime.datetime) -> bool:
    """
    Match daily recurring custom time range stored as custom:HH:MM-HH:MM.
    Supports overnight ranges (e.g. custom:22:00-06:30).
    """
    if not period.startswith(_CUSTOM_PERIOD_PREFIX):
        return False

    body = period[len(_CUSTOM_PERIOD_PREFIX):]
    if "-" not in body:
        logger.warning("Invalid custom period format: %s", period)
        return True

    start_str, end_str = body.split("-", 1)
    try:
        start_hour, start_minute = _parse_time_part(start_str)
        end_hour, end_minute = _parse_time_part(end_str)
    except ValueError as exc:
        logger.warning("Failed to parse custom period %s: %s", period, exc)
        return True

    now = _time_to_seconds(dt.hour, dt.minute, dt.second)
    start = _time_to_seconds(start_hour, start_minute)
    end = _time_to_seconds(end_hour, end_minute, 59)

    if start <= end:
        return start <= now <= end
    return now >= start or now <= end


def match_trigger_period(period: str, dt: datetime.datetime) -> bool:
    """Return True if current datetime is within the configured trigger period."""
    if not period:
        return True

    if period.startswith(_CUSTOM_PERIOD_PREFIX):
        return match_custom_period(period, dt)

    if croniter.is_valid(period):
        return croniter.match(period, dt)

    logger.warning("Invalid trigger period filter: %s", period)
    return True


class RuleTriggerFilter:
    """Rule trigger filter class"""
    _CONTINUOUS_CHECK_INTERVAL: int = 1000 * 10    # Post-processing continuous non-trigger detection interval ms
    _TRIGGER_INTERVAL_MIN: int = 1000 * 10  # Post-processing trigger interval minimum value ms

    # Record rule condition changes for specified camera
    _condition_history: Dict[str, Dict[str, OrderedDict[int, bool]]]
    # Record trigger time queue for specified rule
    _trigger_history: Dict[str, deque]

    def __init__(self):
        self._condition_history = {}
        self._trigger_history = {}

    def _default_rule_state(self, rule_id: str, camera_tag: str = None, filter_frequency: int = 1):
        """Default rule state."""
        self._condition_history.setdefault(rule_id, {})

        if camera_tag:
            self._condition_history[rule_id].setdefault(camera_tag, OrderedDict())

        self._trigger_history.setdefault(rule_id, deque(maxlen=filter_frequency))

    def pre_filter(self, rule: TriggerRule) -> bool:
        """Pre Trigger filter."""
        ts_now = int(datetime.datetime.now().timestamp() * 1000)
        if not rule.enabled:
            return False

        if not rule.filter:
            return True

        frequency = rule.filter.frequency.frequency if rule.filter.frequency else 1
        self._default_rule_state(rule.id, filter_frequency=frequency)

        # Check trigger period (preset cron or custom:HH:MM-HH:MM)
        period_expression = rule.filter.period
        if period_expression:
            now_dt = datetime.datetime.fromtimestamp(ts_now / 1000)
            if not match_trigger_period(period_expression, now_dt):
                logger.info(
                    "trigger_pre_filter rule-%s: period: %s mismatch now_timestamp: %d, Not Exec",
                    rule.id, period_expression, ts_now)
                return False

        # Check trigger frequency
        trigger_queue: deque = self._trigger_history[rule.id]
        filters = [rule.filter.frequency] if rule.filter.frequency else []
        if rule.filter.interval:
            filters.append(TriggerFrequencyFilter(frequency=1, period=rule.filter.interval))

        for freq_filter in filters:
            if (len(trigger_queue) >= freq_filter.frequency and
                    ts_now - trigger_queue[-freq_filter.frequency] < freq_filter.period * 1000):
                logger.info(
                    "trigger_pre_filter rule-%s: over frequency: %d/%ds, Not Exec",
                    rule.id, freq_filter.frequency, freq_filter.period)
                return False

        return True

    def post_filter(self, rule_id: str, camera_tag: str, result: bool) -> bool:
        """Post Trigger filter."""
        ts_now = int(datetime.datetime.now().timestamp() * 1000)
        self._default_rule_state(rule_id, camera_tag=camera_tag)

        # FIFO, remove oldest
        conditions: OrderedDict[int, bool] = self._condition_history[rule_id][camera_tag]
        while len(conditions) > 0 and list(conditions.keys())[0] < ts_now - self._CONTINUOUS_CHECK_INTERVAL:
            conditions.popitem(last=False)

        last_status = any(list(conditions.values()))
        conditions[ts_now] = result

        # Check if continuous status(total) same as current, exec only status changed
        if last_status == result:
            logger.info(
                "trigger_post_filter rule-%s_camera-%s: last_status-%s same to current_status-%s, Not Exec",
                rule_id, camera_tag, last_status, result)
            return False

        # Check if the last trigger time is too close
        if (len(self._trigger_history[rule_id]) > 0 and
                ts_now - self._trigger_history[rule_id][-1] <
                self._TRIGGER_INTERVAL_MIN):
            logger.info(
                "trigger_post_filter rule-%s_camera-%s: last_trigger_time-%d "
                "too close to current_trigger_time-%d, Not Exec",
                rule_id, camera_tag, self._trigger_history[rule_id][-1], ts_now)
            return False

        # Same rule different condition has been filtered by TRIGGER_INTERVAL_MIN
        if result:
            self._trigger_history[rule_id].append(ts_now)

        return result


trigger_filter = RuleTriggerFilter()
