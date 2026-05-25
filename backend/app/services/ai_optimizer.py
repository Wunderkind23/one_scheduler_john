import math
from datetime import date, timedelta
from typing import List, Dict, Tuple, Any
from ..logger import logger

def optimize_schedule(
    year: int,
    month: int,
    officer_names: List[str],
    leave_map: Dict[str, List[str]],
    shift_model: Any,
    historical_counts: Dict[str, int],
    preferred_off: Dict[str, List[str]],
    no_night_before_leave: bool
) -> Tuple[List[Dict[str, Any]], int]:
    """
    Uses Google OR-Tools Constraint Programming to find an optimal schedule.
    Returns (schedule_data, next_offset) identical to the heuristic generator.
    """
    try:
        from ortools.sat.python import cp_model
    except ImportError:
        logger.error("OR-Tools not installed.")
        raise RuntimeError("OR-Tools is not installed.")

    model = cp_model.CpModel()
    
    import calendar
    _, days_in_month = calendar.monthrange(year, month)
    
    # Extract shift constraints
    # Example shift types: Morning, Night, etc.
    if shift_model and shift_model.shift_types:
        import json
        shift_types = json.loads(shift_model.shift_types)
        max_consecutive = getattr(shift_model, "max_consecutive_workdays", 6)
        min_rest = getattr(shift_model, "min_rest_hours_between_shifts", 12)
        working_days = json.loads(shift_model.working_days) if getattr(shift_model, "working_days", None) else None
    else:
        shift_types = [
            {"name": "Morning", "count": 2, "start_time": "07:00", "end_time": "17:00"},
            {"name": "Night",   "count": 2, "start_time": "17:00", "end_time": "07:00"},
        ]
        max_consecutive = 6
        min_rest = 12
        working_days = None

    num_officers = len(officer_names)
    num_days = days_in_month
    num_shifts = len(shift_types)
    
    # Create variables: shifts[(d, o, s)] = 1 if officer o is assigned to shift s on day d
    shifts = {}
    for d in range(1, num_days + 1):
        for o in range(num_officers):
            for s in range(num_shifts):
                shifts[(d, o, s)] = model.NewBoolVar(f'shift_d{d}_o{o}_s{s}')
                
    # 1. Coverage constraint: Each shift must have exact number of officers
    for d in range(1, num_days + 1):
        date_str = f"{year}-{month:02d}-{d:02d}"
        weekday = date(year, month, d).strftime("%A")
        is_working_day = working_days is None or weekday in working_days
        
        for s, shift_info in enumerate(shift_types):
            required = shift_info.get("count", 2) if is_working_day else 0
            model.AddExactLinearExpr(sum(shifts[(d, o, s)] for o in range(num_officers)), required)
            
    # 2. At most one shift per day per officer
    for d in range(1, num_days + 1):
        for o in range(num_officers):
            model.AddAtMostOne(shifts[(d, o, s)] for s in range(num_shifts))
            
    # 3. Leave constraint: Cannot work on leave days
    for o, name in enumerate(officer_names):
        for d in range(1, num_days + 1):
            date_str = f"{year}-{month:02d}-{d:02d}"
            if date_str in leave_map.get(name, []):
                for s in range(num_shifts):
                    model.Add(shifts[(d, o, s)] == 0)
                    
    # 4. No night before leave
    if no_night_before_leave:
        for o, name in enumerate(officer_names):
            for d in range(1, num_days):
                curr_date = f"{year}-{month:02d}-{d:02d}"
                next_date = f"{year}-{month:02d}-{d+1:02d}"
                if next_date in leave_map.get(name, []) and curr_date not in leave_map.get(name, []):
                    # For all shifts that are "Night"
                    for s, shift_info in enumerate(shift_types):
                        if "night" in shift_info.get("name", "").lower():
                            model.Add(shifts[(d, o, s)] == 0)
                            
    # 5. Consecutive workdays constraint
    for o in range(num_officers):
        for start_d in range(1, num_days - max_consecutive + 1):
            # Sum of shifts over max_consecutive + 1 days cannot exceed max_consecutive
            model.Add(
                sum(shifts[(d, o, s)] 
                    for d in range(start_d, start_d + max_consecutive + 1) 
                    for s in range(num_shifts)) <= max_consecutive
            )
            
    # 6. Min rest hours constraint (simplified: no consecutive shifts if rest < min_rest)
    # We'll just enforce no night shift followed by morning shift the next day.
    # A robust implementation would parse start/end times and check hours.
    for o in range(num_officers):
        for d in range(1, num_days):
            night_shifts = [s for s, i in enumerate(shift_types) if "night" in i.get("name", "").lower()]
            morning_shifts = [s for s, i in enumerate(shift_types) if "morning" in i.get("name", "").lower()]
            if night_shifts and morning_shifts:
                for ns in night_shifts:
                    for ms in morning_shifts:
                        # Cannot work morning shift on day d+1 if worked night shift on day d
                        model.AddImplication(shifts[(d, o, ns)], shifts[(d+1, o, ms)].Not())

    # Soft constraints: Fair distribution & preferences
    # We minimize a penalty function
    penalties = []
    
    # A. Preferences: Penalize assigning shifts on preferred off dates
    for o, name in enumerate(officer_names):
        prefs = preferred_off.get(name, [])
        for d in range(1, num_days + 1):
            date_str = f"{year}-{month:02d}-{d:02d}"
            if date_str in prefs:
                # Add 10 penalty points if assigned a shift
                for s in range(num_shifts):
                    penalty_var = model.NewBoolVar(f"pref_penalty_d{d}_o{o}_s{s}")
                    model.AddImplication(shifts[(d, o, s)], penalty_var)
                    penalties.append(10 * penalty_var)
                    
    # B. Fairness: Try to balance total shifts per officer
    # total shifts for officer o = sum(shifts) + historical_counts
    total_shifts_vars = []
    for o, name in enumerate(officer_names):
        total_worked = sum(shifts[(d, o, s)] for d in range(1, num_days + 1) for s in range(num_shifts))
        total = model.NewIntVar(0, 1000, f"total_shifts_o{o}")
        model.Add(total == total_worked + historical_counts.get(name, 0))
        total_shifts_vars.append(total)
        
    # Min/Max differences to keep it balanced
    max_shifts = model.NewIntVar(0, 1000, "max_shifts")
    min_shifts = model.NewIntVar(0, 1000, "min_shifts")
    model.AddMaxEquality(max_shifts, total_shifts_vars)
    model.AddMinEquality(min_shifts, total_shifts_vars)
    
    diff = model.NewIntVar(0, 1000, "shift_diff")
    model.Add(diff == max_shifts - min_shifts)
    
    # Heavily penalize the max-min difference
    # We want diff to be as close to 0 as possible.
    penalties.append(100 * diff)
    
    # Objective
    model.Minimize(sum(penalties))
    
    # Solve
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10.0 # Time limit
    status = solver.Solve(model)
    
    if status == cp_model.INFEASIBLE:
        raise ValueError("AI Optimizer could not find a feasible schedule satisfying all constraints.")
    
    # Extract results
    schedule_data = []
    for d in range(1, num_days + 1):
        date_str = f"{year}-{month:02d}-{d:02d}"
        weekday = date(year, month, d).strftime("%A")
        
        row = {"Date": date_str, "Day": weekday}
        
        # Populate shift columns
        for s, shift_info in enumerate(shift_types):
            s_name = shift_info.get("name", "Unknown")
            # Usually Morning (7AM - 5PM) etc.
            if "morning" in s_name.lower():
                col_name = "Morning (7AM - 5PM)"
            elif "night" in s_name.lower():
                col_name = "Night (5PM - 12AM)"
            else:
                col_name = s_name
                
            assigned_officers = []
            for o in range(num_officers):
                if solver.Value(shifts[(d, o, s)]) == 1:
                    assigned_officers.append(officer_names[o])
            row[col_name] = ", ".join(assigned_officers) if assigned_officers else ""
            
        # Determine off / leave
        off_officers = []
        for o, name in enumerate(officer_names):
            if date_str in leave_map.get(name, []):
                off_officers.append(f"{name} (Leave)")
            else:
                worked = sum(solver.Value(shifts[(d, o, s)]) for s in range(num_shifts))
                if worked == 0:
                    off_officers.append(name)
        row["Off"] = ", ".join(off_officers) if off_officers else ""
        
        schedule_data.append(row)
        
    return schedule_data, 0
