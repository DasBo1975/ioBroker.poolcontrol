<!-- PoolControl Help File – maintained manually. Do NOT remove this header. -->

# PoolControl – Help & Documentation

Welcome to the help file of the adapter **ioBroker.poolcontrol**.  
This documentation explains all settings, data points, and automatic functions of the adapter in a mix of understandable explanations and technical details.

---

# 📚 Table of Contents

1. [Introduction & Basic Principles](#introduction--basic-principles)  
2. [Overview – What does the adapter do?](#overview--what-does-the-adapter-do)  
3. [Admin Configuration (Tabs)](#admin-configuration-tabs)  
   - [3.1 General Settings](#31-general-settings)  
   - [3.2 Pump](#32-pump)  
   - [3.3 Temperature Management](#33-temperature-management)  
   - [3.4 Solar Management](#34-solar-management)  
   - [3.5 Photovoltaics (PV)](#35-photovoltaics-pv)  
   - [3.6 AI System](#36-ai-system)  
   - [3.7 Speech Outputs](#37-speech-outputs)  
   - [3.8 Time Control](#38-time-control)  
   - [3.9 Debug & SystemCheck](#39-debug--systemcheck)  
4. [Object Tree – Data Points Explained](#object-tree--data-points-explained)  
5. [Automatic Logics & Helpers](#automatic-logics--helpers)  
6. [Error Detection & Warnings](#error-detection--warnings)  
7. [Speech Outputs & Notifications](#speech-outputs--notifications)  
8. [FAQ & Tips](#faq--tips)

---

# 1. Introduction & Basic Principles

The PoolControl adapter automates and monitors your entire pool system:

- Pump control  
- Temperature management  
- Solar control  
- Photovoltaic support  
- Pressure sensor analysis  
- Consumption and cost tracking  
- Status and diagnostic functions  
- AI-based weather and pool hints  
- Backwashing, maintenance mode and post-pumping  

All data points are structured in the object tree and are available for VIS, Blockly, and other adapters.

---

# 2. Overview – What does the adapter do?

### ✔ Fully automatic pump control  
Solar, PV, frost, time mode, maintenance, backwashing, post-pumping.

### ✔ Temperature evaluation  
Up to 6 sensors with minimum/maximum values and differences.

### ✔ Solar control with hysteresis  
Automatic switching on/off of the pump.

### ✔ Photovoltaic mode  
The pump runs when there is PV surplus.

### ✔ Pressure sensor integration  
Trend, learning values, normal range, diagnostics.

### ✔ AI System  
Daily summaries, weather hints, pool tips, weekend reports.

### ✔ Consumption & Costs  
Automatic daily, weekly, monthly, and yearly statistics.

### ✔ Status system  
Central overview for visualization.

---

# 3. Admin Configuration (Tabs)

Configuration is done via multiple tabs in the instance.

---

## 3.1 General Settings

**Pool name**  
Pure display text.

**Pool size (liters)**  
Used for circulation calculation.

**Minimum circulation factor per day**  
Example: 2 means the entire pool volume should be circulated twice per day.

**Season active**  
Important for automatic functions:  
- **true**: All automations active  
- **false**: Automation off, only frost protection remains active  

The actual state is located in the object tree under `status.season_active`.

---

## 3.2 Pump

**On/Off:**  
→ `pump.pump_switch`  

**Mode:**  
→ `pump.mode`  

Possible values:  
- `auto`  
- `manual`  
- `time`  
- `off`  
- `controlHelper` (set automatically by the adapter)  
- `pv` (Photovoltaic mode)

**Additional settings:**  
- Maximum power (watts)  
- Maximum flow rate (l/h)  
- Object ID of the socket  
- Frost protection active + temperature value  

---

## 3.3 Temperature Management

Up to 6 sensors:

- Surface  
- Bottom  
- Flow  
- Return  
- Collector  
- Outside temperature  

For each sensor:

- Checkbox “use”  
- Select object ID  

Temperature values are used for:

- Solar control  
- Frost protection  
- Diagnostics  
- AI texts  

---

## 3.4 Solar Management

Settings:

- Enable solar control  
- Enable hysteresis  
- Switch-on threshold (`temp_on`)  
- Switch-off threshold (`temp_off`)  
- Enable solar warnings  

Solar control works only in **auto** mode.

---

## 3.5 Photovoltaics (PV)

Settings:

- PV automation active  
- Object ID of current PV power  
- Switch-on threshold (e.g., 150 W surplus)

If active:

- Pump mode shows “Automatic (PV)”  
- Pump runs with PV surplus  
- Automatically switches off when below threshold  

---

## 3.6 AI System

### **Main switch (ai.enabled)**

| Data point | Meaning |
|------------|----------|
| ai.enabled | Main switch for the entire AI system |

The AI system currently consists of two modules:

- aiHelper (weather & daily functions)
- aiForecastHelper (forecast for tomorrow)

The AI system automatically generates daily:

- Weather hints  
- Daily summaries  
- Pool tips  
- Weekend reports  
- Forecast for tomorrow  

### **Switches (ai.weather.switches.)**

| Data point | Meaning |
|------------|----------|
| ai.weather.switches.allow_speech | Also outputs to `speech.queue` |
| ai.weather.switches.daily_summary_enabled | Daily summary |
| ai.weather.switches.daily_pool_tips_enabled | Pool tips |
| ai.weather.switches.weather_advice_enabled | Weather hints |
| ai.weather.switches.weekend_summary_enabled | Weekend report |
| ai.weather.switches.debug_mode | Additional log entries |
| ai.weather.switches.tomorrow_forecast_enabled | Forecast for tomorrow active |

### **Schedules (ai.weather.schedule.)**

- daily_summary_time  
- daily_pool_tips_time  
- weather_advice_time  
- weekend_summary_time  
- tomorrow_forecast_time  

All values in HH:MM format.

### **Outputs (ai.weather.outputs.)**

Texts appear here that can be used by VIS or other adapters.

The AI system requires geodata from **system.config**.

---

## 3.7 Speech Outputs

- Enable speech  
- Texts for pump start/stop  
- Last speech output  
- Optional: Enable email notification  
- All outputs are sent via **speech.queue**

---

## 3.8 Time Control

Up to **three time windows**:

- Start time  
- End time  
- Weekdays  

Only active if `pump.mode = time`.

---

## 3.9 Debug & SystemCheck

The section `systemcheck.debug_logs` provides:

- Selection of a target area (pump, solar, runtime, control, etc.)  
- Continuous log  
- Clear log  

This is used for diagnostics but should remain disabled during normal operation.

---

# 4. Object Tree – Data Points Explained

### The most important main areas:

- `pump.*`  
- `pump.pressure.*`  
- `temperature.*`  
- `solar.*`  
- `photovoltaic.*`  
- `runtime.*`  
- `circulation.*`  
- `consumption.*`  
- `control.*`  
- `status.*`  
- `info.*`  
- `ai.*`  
- `systemcheck.*`

The structure is designed to be self-explanatory in the object tree.  
All states have descriptive names and descriptions.

---

# 5. Automatic Logics & Helpers

The adapter contains various helper files responsible for specific tasks.

### **PumpHelper**
Controls basic pump functions.

### **PumpHelper4 (Pressure Sensor)**
Processes:
- Current pressure  
- Previous value  
- Trend (rising/falling/stable)  
- Learning system for min/max  
- Diagnostic text  

### **SolarHelper**
Controls solar operation including hysteresis.

### **PhotovoltaicHelper**
Automatic pump control based on PV surplus.

### **FrostHelper**
Automatically switches on the pump below the configured temperature.

### **RuntimeHelper**
Calculates runtime and circulation.

### **ConsumptionHelper**
Daily, weekly, monthly, and yearly consumption.

### **ControlHelper**
Functions:
- Backwashing  
- Maintenance mode  
- Post-pumping (circulation check)  
- Notifications  

### **InfoHelper**
- Adapter version  
- Seasonal greetings including Easter calculation  

### **AI-Helper**
- Weather retrieval (Open-Meteo)  
- Text generation  
- Schedules  
- Anti-spam logic  

### **DebugLogHelper**
- Real-time monitoring of specific areas  

---

# 6. Error Detection & Warnings

The adapter automatically detects:

- Dry run  
- Overload  
- Power despite OFF  
- Pressure deviations  
- Solar warnings  
- Backwash reminders  

Errors are displayed in `pump.error` and `pump.status`.

---

# 7. Speech Outputs & Notifications

All speech outputs are sent via `speech.queue`.  
Depending on configuration, emails can also be sent.

---

# 8. FAQ & Tips

**1. Why does nothing happen although AI is active?**  
→ Check whether system.config contains latitude/longitude.

**2. Why does the pump not switch on despite solar?**  
→ Mode must be **auto**.

**3. Why is PV not running?**  
→ Check threshold → PV must be above this value.

**4. Why does the pressure sensor show 0 bar?**  
→ Check the object ID in the Admin configuration.

---

**End of file**