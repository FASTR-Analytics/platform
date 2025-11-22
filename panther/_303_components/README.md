# _303_components

SolidJS reactive UI components library for building interactive data
applications.

## Purpose

Complete set of production-ready SolidJS components including:

- Form inputs (buttons, inputs, selects, sliders, etc.)
- Layout components (frames, tabs, steppers, etc.)
- Chart and visualization holders
- State management and modals
- Data tables with sorting/filtering/pagination
- Icon library (Tabler Icons)

## Prerequisites

Your application must have:

- **SolidJS** v1.8+
- **Tailwind CSS** v4 with theme configuration (see main CLAUDE.md)

## Component Categories

### Charts (`charts/`)

```typescript
<ChartHolder figure={myFigure} />
<PageHolder page={myPage} />
```

Display Panther visualizations in SolidJS apps.

### Form Inputs (`form_inputs/`)

```typescript
<Button intent="primary" onClick={handleClick}>Save</Button>
<Input value={value()} onChange={setValue} />
<Select options={options} value={selected()} onChange={setSelected} />
<Slider min={0} max={100} value={value()} onChange={setValue} />
<Checkbox checked={checked()} onChange={setChecked} />
<TextArea value={text()} onChange={setText} />
```

Complete form control library.

### Layout (`layout/`)

```typescript
<FrameSide sidebar={<Sidebar />}>{mainContent}</FrameSide>
<FrameTop header={<Header />}>{mainContent}</FrameTop>
<Tabs tabs={tabs} activeTab={active()} onTabChange={setActive} />
<Stepper steps={steps} currentStep={current()} />
```

Page layout and navigation components.

### Icons (`icons/`)

```typescript
<ChevronRightIcon size={24} />
<CheckIcon color="green" />
```

100+ Tabler Icons as SolidJS components.

### Special State (`special_state/`)

```typescript
// Alerts
alert("Message");
confirm("Are you sure?");
prompt("Enter name:");

// State management
<StateHolderWrapper initialState={state}>
  {children}
</StateHolderWrapper>;
```

Modals, dialogs, and state containers.

### Tables (`tables/`)

```typescript
<DisplayTable
  columns={columns}
  data={data()}
  sortable
  filterable
  paginate
  pageSize={20}
/>

<CsvTable csv={csvData()} />
```

Rich data tables with built-in features.

## CSS Public API

Only these 7 utility classes for external use:

- `ui-pad`, `ui-pad-sm` - Padding
- `ui-gap`, `ui-gap-sm` - Gap spacing
- `ui-spy`, `ui-spy-sm` - Vertical spacing
- `ui-hoverable` - Hover effects

## Usage Example

```typescript
import {
  Button,
  DisplayTable,
  FrameSide,
  Input,
  SettingsIcon,
} from "@timroberton/panther";

function MyApp() {
  const [value, setValue] = createSignal("");

  return (
    <FrameSide sidebar={<Sidebar />}>
      <div class="ui-pad">
        <div class="ui-spy">
          <Input
            value={value()}
            onChange={setValue}
            placeholder="Search..."
          />
          <Button intent="primary" onClick={handleSearch}>
            <SettingsIcon size={16} />
            Search
          </Button>
          <DisplayTable columns={columns} data={results()} />
        </div>
      </div>
    </FrameSide>
  );
}
```

## Module Dependencies

- `solid-js` - SolidJS framework
- `@solidjs/router` - Routing
- `sortablejs` - Drag-and-drop
- Internal: `_301_util_funcs`, `_304_query`
