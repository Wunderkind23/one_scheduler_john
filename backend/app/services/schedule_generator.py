from datetime import date, timedelta, datetime
from typing import Dict, List, Optional, Tuple, Set

DAYS          = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
SMO_MORNING   = 2
SMO_NIGHT     = 2
SMO_MAX_LEAVE = 1

def expand_leave_with_weekends_and_holidays(
    leave_dates:   List[str],
    holiday_dates: Set[str],
    extend_forward: bool = False,
) -> List[str]:
    """
    Return the consecutive dates from start to end of the leave request.
    If extend_forward is True, includes following weekends/holidays.
    """
    if not leave_dates:
        return []

    date_objs = sorted([date.fromisoformat(d) for d in leave_dates])
    start     = date_objs[0]
    end       = date_objs[-1]

    if extend_forward:
        while True:
            nxt = end + timedelta(days=1)
            if nxt.weekday() >= 5 or nxt.isoformat() in holiday_dates:
                end = nxt
            else:
                break

    result: List[str] = []
    cur = start
    while cur <= end:
        result.append(cur.isoformat())
        cur += timedelta(days=1)
    return result

def check_coverage(
    leave_map:      Dict[str, List[str]],
    max_concurrent: int = SMO_MAX_LEAVE,
) -> List[Dict]:
    date_count: Dict[str, List[str]] = {}
    for officer, dates in leave_map.items():
        for d in dates:
            date_count.setdefault(d, []).append(officer)

    problems = []
    for d, officers in sorted(date_count.items()):
        count = len(officers)
        if count > max_concurrent:
            problems.append({
                "date":              d,
                "officers_on_leave": officers,
                "count":             count,
                "max_allowed":       max_concurrent,
                "severity":          "error",
                "message": (
                    f"{count} officers on leave on {d} "
                    f"(max {max_concurrent} allowed). "
                    f"Officers: {', '.join(officers)}"
                ),
            })
        elif count == max_concurrent:
            problems.append({
                "date":              d,
                "officers_on_leave": officers,
                "count":             count,
                "max_allowed":       max_concurrent,
                "severity":          "warning",
                "message": f"At capacity on {d}: {', '.join(officers)} on leave",
            })
    return problems


def generate_schedule(
    year:         int,
    month:        int,
    officers:     List[str],
    leave_map:    Dict[str, List[str]],
    shift_model   = None,
    start_offset: int = 0,
    no_night_before_leave: bool = False,
    historical_counts: Dict[str, int] = None,
    preferred_off: Dict[str, List[str]] = None,
) -> Tuple[List[dict], int]:
    """
    Pattern-based schedule generator. 
    Uses ShiftModel.rotation_pattern if available, otherwise defaults to SMO rotation.
    """
    n = len(officers)
    if n == 0:
        return [], start_offset

    # 1. Resolve Shift Model Parameters
    pattern      = getattr(shift_model, "rotation_pattern", None)
    night_cont   = getattr(shift_model, "night_continues", True)
    working_days = getattr(shift_model, "working_days", None)
    no_night     = getattr(shift_model, "no_night_before_leave", False) if shift_model else no_night_before_leave
    max_consec   = getattr(shift_model, "max_consecutive_workdays", 6)
    if max_consec is None:
        max_consec = 6
    min_rest     = getattr(shift_model, "min_rest_hours_between_shifts", 12)
    if min_rest is None:
        min_rest = 12
    
    # Setup shift requirements array for dynamic balancing
    shift_reqs = []
    if shift_model and getattr(shift_model, "shift_types", None):
        for s in shift_model.shift_types:
            name = s.get("name")
            shift_reqs.append({
                "name": name,
                "count": int(s.get("count", 2)),
                "display": f"{name} ({s.get('start_time','?')} - {s.get('end_time','?')})",
                "start_time": s.get("start_time", "08:00"),
                "end_time": s.get("end_time", "16:00")
            })
    else:
        shift_reqs = [
            {"name": "Morning", "count": SMO_MORNING, "display": "Morning (7AM - 5PM)", "start_time": "07:00", "end_time": "17:00"},
            {"name": "Night",   "count": SMO_NIGHT,   "display": "Night (5PM - 12AM)", "start_time": "17:00", "end_time": "07:00"}
        ]

    # Map shift names to display columns
    shift_cols = {req["name"]: req["display"] for req in shift_reqs}
    shift_cols["Off"] = "Off"

    # 2. Default SMO Pattern (if none provided)
    if not pattern:
        # Day, Off, Day, Off, Night, Off, Night, Off, Off (9 days)
        pattern = ["Morning", "Off", "Morning", "Off", "Night", "Off", "Night", "Off", "Off"]

    pat_len = len(pattern)
    
    # 3. Setup Dates
    start_date = date(year, month, 1)
    end_date   = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    num_days   = (end_date - start_date).days

    schedule:   List[dict] = []
    prev_night: List[str]  = []

    # Track state for dynamic balancing
    shift_counts = {}
    for o in officers:
        shift_counts[o] = historical_counts.get(o, 0) if historical_counts else 0
    last_shift_name = {o: None for o in officers}
    last_shift_day = {o: -2 for o in officers}
    consecutive_workdays = {o: 0 for o in officers}
    pref_off = preferred_off or {}

    # 4. Generate Daily Rows
    for d in range(num_days):
        cur_date     = start_date + timedelta(days=d)
        day_str      = cur_date.isoformat()
        display_date = cur_date.strftime("%d-%b-%y")
        day_name     = DAYS[cur_date.weekday()]

        row = {
            "Date": display_date,
            "Day":  day_name,
        }
        for col in shift_cols.values():
            row[col] = []

        is_working_day = not working_days or day_name in working_days

        if not is_working_day:
            row["Off"] = [f"{o} (Leave)" if day_str in leave_map.get(o, []) else o for o in officers]
            for o in officers:
                consecutive_workdays[o] = 0
        else:
            # 1. Base Intent (What were they supposed to do according to the pattern?)
            base_intent = {}
            for o in officers:
                idx = (start_offset + d + officers.index(o)) % pat_len
                base_intent[o] = pattern[idx]
                
            day_assignments = {} # o -> shift_name
            assigned_today = set()
            
            # 2. Fill exactly 'needed' for each shift
            for req in shift_reqs:
                s_name = req["name"]
                needed = req["count"]
                
                is_night_shift = "night" in s_name.lower()
                
                # Filter candidates who are not assigned yet today
                candidates = [o for o in officers if o not in assigned_today]
                
                def get_penalty(o: str) -> float:
                    # On leave?
                    if day_str in leave_map.get(o, []):
                        return 999999.0
                        
                    # Max Consecutive Workdays check
                    if consecutive_workdays[o] >= max_consec:
                        return 999999.0
                        
                    # No night shift before leave check
                    if no_night and is_night_shift:
                        tomorrow_date = cur_date + timedelta(days=1)
                        tomorrow_str = tomorrow_date.isoformat()
                        if tomorrow_str in leave_map.get(o, []):
                            return 999999.0
                            
                    # Rest Hours check (between last shift end and proposed shift start)
                    if last_shift_name[o] and last_shift_day[o] >= d - 2:
                        prev_shift_info = next((sr for sr in shift_reqs if sr["name"] == last_shift_name[o]), None)
                        if prev_shift_info:
                            prev_end_t = prev_shift_info.get("end_time") or ("17:00" if "morning" in last_shift_name[o].lower() else "07:00")
                            prev_start_t = prev_shift_info.get("start_time") or ("07:00" if "morning" in last_shift_name[o].lower() else "17:00")
                            prev_day_date = start_date + timedelta(days=last_shift_day[o])
                            
                            try:
                                prev_end_dt = datetime.combine(prev_day_date, datetime.strptime(prev_end_t, "%H:%M").time())
                                if prev_end_t <= prev_start_t: # Overnight shift
                                    prev_end_dt += timedelta(days=1)
                            except Exception:
                                prev_end_dt = datetime.combine(prev_day_date + timedelta(days=1), datetime.strptime("07:00", "%H:%M").time())
                                
                            prop_start_t = req.get("start_time") or ("07:00" if "morning" in s_name.lower() else "17:00")
                            try:
                                prop_start_dt = datetime.combine(cur_date, datetime.strptime(prop_start_t, "%H:%M").time())
                            except Exception:
                                prop_start_dt = datetime.combine(cur_date, datetime.strptime("07:00", "%H:%M").time())
                                
                            gap_hours = (prop_start_dt - prev_end_dt).total_seconds() / 3600.0
                            if gap_hours < min_rest:
                                return 999999.0
                                
                    # Base equity score (shifts worked so far)
                    score = shift_counts[o] * 10.0
                    
                    # Preference penalty
                    if day_str in pref_off.get(o, []):
                        score += 1000.0
                        
                    # Pattern mismatch penalty
                    intent = base_intent.get(o, "Off")
                    if intent != s_name:
                        score += 100.0
                        
                    return score

                # Sort by penalty
                candidates.sort(key=get_penalty)
                
                # Check for valid candidates (penalty < 900000)
                selected = []
                for o in candidates:
                    if len(selected) >= needed:
                        break
                    if get_penalty(o) < 900000.0:
                        selected.append(o)
                        
                # Record assignments
                for o in selected:
                    day_assignments[o] = s_name
                    assigned_today.add(o)

            # 3. Write row & update stats
            for o in officers:
                if day_str in leave_map.get(o, []):
                    row["Off"].append(f"{o} (Leave)")
                    consecutive_workdays[o] = 0
                elif o in assigned_today:
                    s = day_assignments[o]
                    col = shift_cols[s]
                    row.setdefault(col, []).append(o)
                    shift_counts[o] += 1
                    last_shift_name[o] = s
                    last_shift_day[o] = d
                    consecutive_workdays[o] += 1
                else:
                    row["Off"].append(o)
                    consecutive_workdays[o] = 0

        # Convert lists to strings
        for k in row:
            if isinstance(row[k], list):
                row[k] = ", ".join(row[k])

        schedule.append(row)
        
        # Extract night shift for next day's 12AM-7AM column
        night_col = next((req["display"] for req in shift_reqs if "Night" in req["name"]), "Night (5PM - 12AM)")
        current_night_str = row.get(night_col, "")
        prev_night = [n.strip() for n in current_night_str.split(", ") if n.strip() and "(Leave)" not in n]

    # Return schedule and the new offset to continue next month
    return schedule, start_offset + num_days


def build_summary(schedule: List[dict]) -> List[dict]:
    raw: Dict[str, Dict[str, int]] = {}
    
    # Identify shift columns (excluding Date and Day)
    if not schedule:
        return []
    
    all_cols = list(schedule[0].keys())
    shift_cols = [c for c in all_cols if c not in ["Date", "Day", "12AM - 7AM (prev night)"]]

    for row in schedule:
        for col in shift_cols:
            cell = row.get(col, "")
            if not cell:
                continue
            
            # Simple label for summary (e.g. "Morning (7AM - 5PM)" -> "Morning")
            label = col.split(" (")[0] if " (" in col else col
            
            for entry in cell.split(", "):
                entry = entry.strip()
                if not entry:
                    continue
                on_leave = "(Leave)" in entry
                officer  = entry.replace(" (Leave)", "").strip()
                if not officer:
                    continue
                
                if officer not in raw:
                    raw[officer] = {"Leave": 0}
                
                if on_leave:
                    raw[officer]["Leave"] += 1
                else:
                    raw[officer][label] = raw[officer].get(label, 0) + 1

    has_leave = any(v["Leave"] > 0 for v in raw.values())
    result    = []
    for officer, counts in raw.items():
        row = {"Officer": officer}
        for label, count in counts.items():
            if label == "Leave":
                continue
            row[label] = count
        if has_leave:
            row["Leave"] = counts["Leave"]
        result.append(row)
    return result


def extract_assignments(schedule: List[dict]) -> List[dict]:
    if not schedule:
        return []

    all_cols = list(schedule[0].keys())
    shift_cols = [c for c in all_cols if c not in ["Date", "Day", "12AM - 7AM (prev night)"]]
    
    assignments = []
    for row in schedule:
        try:
            date_iso = datetime.strptime(row["Date"], "%d-%b-%y").strftime("%Y-%m-%d")
        except Exception:
            date_iso = row["Date"]
            
        for col in shift_cols:
            cell = row.get(col, "")
            if not cell:
                continue
                
            # Simple label for storage
            shift_label = col.split(" (")[0] if " (" in col else col
            
            for entry in cell.split(", "):
                entry    = entry.strip()
                on_leave = "(Leave)" in entry
                name     = entry.replace(" (Leave)", "").strip()
                if name:
                    assignments.append({
                        "officer_name": name,
                        "date_iso":     date_iso,
                        "shift_name":   "Leave" if on_leave else shift_label,
                        "is_leave":     on_leave,
                    })
    return assignments

def sync_assignments_for_schedule(schedule, db):
    from ..models import ShiftAssignment, Officer
    import json
    import logging

    # Clear existing assignments
    db.query(ShiftAssignment).filter(ShiftAssignment.schedule_id == schedule.id).delete()
    
    # Get active officers for this team
    officers = db.query(Officer).filter(
        Officer.team_id == schedule.team_id,
        Officer.is_active == True
    ).all()
    off_dict = {o.name: o for o in officers}
    
    try:
        data = json.loads(schedule.data)
        for a in extract_assignments(data):
            o = off_dict.get(a["officer_name"])
            if o:
                db.add(ShiftAssignment(
                    schedule_id = schedule.id,
                    officer_id  = o.id,
                    date        = a["date_iso"],
                    shift_name  = a["shift_name"],
                    is_leave    = a["is_leave"],
                ))
                o.last_assigned_shift = a["shift_name"]
        db.commit()
    except Exception as e:
        logging.getLogger(__name__).error(f"Failed to sync assignments for schedule {schedule.id}: {e}")