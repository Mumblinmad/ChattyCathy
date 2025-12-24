# Chatty Cathy Usage Guide

This guide will walk you through setting up and using Chatty Cathy to monitor classroom noise levels.

## Table of Contents

- [First Launch](#first-launch)
- [Main Screen](#main-screen)
- [Setting Up Classes](#setting-up-classes)
- [Configuring Noise Levels](#configuring-noise-levels)
- [Monitoring Your Classroom](#monitoring-your-classroom)
- [Viewing Statistics](#viewing-statistics)
- [Tips & Best Practices](#tips--best-practices)

---

## First Launch

When you first open Chatty Cathy, you'll be greeted with the main monitoring screen.

![First Launch](docs/images/usage/first-launch.png)

Before you can start monitoring, you'll need to:
1. Grant microphone permissions (a browser-style prompt will appear)
2. Create at least one class
3. Select a microphone and class

---

## Main Screen

The main screen is where you'll spend most of your time during class.

![Main Screen Overview](docs/images/usage/main-screen-overview.png)

### Components

| Component | Description |
|-----------|-------------|
| **Volume Meter** | Left sidebar showing real-time noise level with color gradient |
| **Teacher Display** | Large central area showing images based on current noise level |
| **Microphone Selector** | Dropdown to choose which microphone to use |
| **Class Selector** | Dropdown to select which class you're monitoring |
| **Start/Stop Button** | Begin or end the monitoring session |
| **Settings Gear** | Access settings (bottom-right corner) |

### Volume Meter Colors

The meter fills from bottom to top with colors indicating noise level:

- 🟢 **Green** (0-20%) - Very quiet, ideal
- 🟡 **Yellow-Green** (20-40%) - Quiet working level
- 🟠 **Yellow-Orange** (40-60%) - Normal conversation
- 🔴 **Orange-Red** (60-80%) - Getting loud
- ⛔ **Red** (80-100%) - Too loud!

---

## Setting Up Classes

Before monitoring, create classes to organize your data by period or subject.

### Step 1: Open Settings

Click the **gear icon** in the bottom-right corner of the main screen.

![Settings Button](docs/images/usage/settings-button.png)

### Step 2: Navigate to Classes

Click **"Classes"** in the left sidebar.

![Classes Panel](docs/images/usage/classes-panel.png)

### Step 3: Add a New Class

1. Type a class name in the text field (e.g., "Period 1 - Math")
2. Click **"Add Class"** or press Enter

![Add Class](docs/images/usage/add-class.png)

### Managing Classes

- **Edit**: Click the pencil icon to rename a class
- **Delete**: Click the trash icon (this will delete all associated data!)

![Class Actions](docs/images/usage/class-actions.png)

Each class shows a sample count indicating how much data has been collected.

---

## Configuring Noise Levels

Customize the images and thresholds that appear at different noise levels.

### Step 1: Open Levels Settings

In Settings, click **"Levels"** in the left sidebar.

![Levels Panel](docs/images/usage/levels-panel.png)

### Understanding the Threshold Bar

The gradient bar at the top represents noise levels from 0% (left) to 100% (right). The circular stops indicate where one level ends and another begins.

![Threshold Bar](docs/images/usage/threshold-bar.png)

### Adjusting Thresholds

**Drag a stop** left or right to change when that level activates.

![Dragging Threshold](docs/images/usage/drag-threshold.png)

**Add a new stop** by clicking anywhere on the gradient bar.

**Remove a stop** by right-clicking on it.

### Configuring a Level

Click on any stop to select it and reveal the editor panel.

![Level Editor](docs/images/usage/level-editor.png)

#### Setting an Image

1. Click **"Choose Image"**
2. Select an image file from your computer
3. The image will appear in the preview

![Choose Image](docs/images/usage/choose-image.png)

#### Positioning the Image

When using **Fill mode** (default), you can:
- **Drag the preview** to reposition the image
- Choose the focal point you want visible

![Drag to Position](docs/images/usage/drag-position.png)

#### Fill vs Fit Modes

| Mode | Description |
|------|-------------|
| **Fill** | Image fills the entire area (may crop edges) - best for photos |
| **Fit** | Entire image is visible (may show background) - best for graphics |

![Fill vs Fit](docs/images/usage/fill-vs-fit.png)

#### Setting a Label

Type a custom label in the **Label** field (e.g., "Whisper Zone", "Indoor Voice", "TOO LOUD!").

### Suggested Image Ideas

- **Quiet levels**: Smiling teacher, thumbs up, happy classroom scene
- **Medium levels**: Neutral teacher expression, working classroom
- **Loud levels**: Concerned teacher, "shhh" gesture, funny frustrated face
- **Maximum level**: Over-the-top dramatic reaction (kids love these!)

---

## Monitoring Your Classroom

### Starting a Session

1. **Select your microphone** from the dropdown (use your classroom mic or laptop mic)
2. **Select your class** from the class dropdown
3. **Click "Start Monitoring"**

![Start Monitoring](docs/images/usage/start-monitoring.png)

The button will turn red and say "Stop Monitoring" while active.

### During Monitoring

- The **volume meter** updates in real-time
- The **teacher display** shows the image for the current noise level
- **Data is automatically saved** every second for statistics

![Active Monitoring](docs/images/usage/active-monitoring.png)

### Stopping a Session

Click **"Stop Monitoring"** when class ends. Your data is automatically saved.

### Positioning Your Display

For best results:
- **Face the screen toward students** so they can see the visual feedback
- **Position at the front of the classroom** where everyone can see
- **Use a projector** for maximum visibility
- **Consider using a dedicated monitor** that stays on during class

---

## Viewing Statistics

Track noise patterns over time with the comprehensive statistics dashboard.

### Opening Statistics

1. Click the **gear icon** to open Settings
2. Click **"Statistics"** in the left sidebar

![Statistics Panel](docs/images/usage/statistics-panel.png)

### Selecting Data to View

1. **Choose a class** from the dropdown
2. **Choose a time range** (Last Hour, Day, Week, or Month)

![Statistics Controls](docs/images/usage/stats-controls.png)

### Understanding the Chart

The main chart shows noise levels by **time of day**, aggregated across all selected data.

![Statistics Chart](docs/images/usage/stats-chart.png)

- **X-axis**: Time of day
- **Y-axis**: Noise level (0-100%)
- **Hover** over data points for detailed information

### Summary Statistics

![Summary Stats](docs/images/usage/summary-stats.png)

| Statistic | Description |
|-----------|-------------|
| **Average** | Mean noise level for the period |
| **Peak** | Highest noise level recorded |
| **Samples** | Total number of measurements |

### All-Time Records

![All Time Records](docs/images/usage/all-time-records.png)

See your longest quiet streaks and loudest moments across all recorded data.

### Time-Based Patterns

![Time Patterns](docs/images/usage/time-patterns.png)

Discover patterns in your classroom:
- **Quietest Time**: When students are typically calmest
- **Loudest Time**: When things tend to get noisy
- **Day Pattern**: Overall behavior pattern

### Trend Analysis

![Trend Analysis](docs/images/usage/trend-analysis.png)

See if noise levels are **improving** (↓) or **worsening** (↑) over time, with percentage change.

### Volatility Score

![Volatility](docs/images/usage/volatility.png)

Measures how erratic the noise levels are. Lower is more consistent.

### Class Comparison

![Class Comparison](docs/images/usage/class-comparison.png)

Compare average noise levels across all your classes to identify which periods need more attention.

### Teacher Stress Score

![Stress Score](docs/images/usage/stress-score.png)

A fun metric calculated from your daily noise exposure. Ranges from "Zen Master 🧘" to "Code Red Emergency 🆘"!

### Show/Hide Explanations

Click **"Show Explanations"** to reveal helpful descriptions of what each statistic means.

![Toggle Explanations](docs/images/usage/toggle-explanations.png)

---

## Tips & Best Practices

### Microphone Placement

- **Avoid placing the mic right next to speakers** (feedback!)
- **Central classroom location** works best for overall room monitoring
- **USB microphones** often provide better quality than built-in laptop mics

### Threshold Calibration

1. Run a test session during normal class activity
2. Note where the meter typically sits
3. Adjust thresholds so:
   - Normal working volume is in the "green" zone
   - The "red" zone is reserved for truly excessive noise

### Making It Fun

- Let students **help choose the images** for different levels
- Use **funny memes** or inside jokes for the loud levels
- Consider **class-specific images** (photos of your class behaving well!)
- Change images **seasonally** to keep it fresh

### Privacy Considerations

- Chatty Cathy **does not record audio** - it only measures volume levels
- All data stays **100% local** on your computer
- No data is ever transmitted over the internet

### Troubleshooting

| Issue | Solution |
|-------|----------|
| No microphone detected | Check browser/system permissions for microphone access |
| Meter not responding | Ensure the correct microphone is selected |
| Images not showing | Verify the image file still exists at the original location |
| App is sluggish | Close other applications; check available RAM |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+I` | Open Developer Tools (for troubleshooting) |

---

## Getting Help

If you encounter issues or have feature requests:

- **Report bugs**: [GitHub Issues](https://github.com/Mumblinmad/ChattyCathy/issues)
- **Request features**: [GitHub Issues](https://github.com/Mumblinmad/ChattyCathy/issues)

---

<div align="center">

**Happy monitoring!** 🎓📊

*May your classrooms be productive and your noise levels manageable.*

</div>
