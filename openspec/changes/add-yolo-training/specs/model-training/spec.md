## Purpose

Let operators turn their own labeled detection datasets into model weights usable by the Ctrl-F desktop worker.

## ADDED Requirements

### Requirement: Train from a labeled dataset
The training CLI SHALL accept a local dataset YAML defining detection classes and train/validation splits, and SHALL allow operators to select starting weights, epochs, image size, batch size, device, and output directory. Dataset class IDs and names SHALL be preserved.

#### Scenario: Train an existing export
- **WHEN** an operator supplies a valid YOLO detection dataset YAML and training settings
- **THEN** training uses those settings and dataset classes to produce custom weights

### Requirement: Report deployable weights
After successful training, the CLI SHALL verify that best.pt exists and print its absolute path and a YOLO_WEIGHTS_PATH assignment. Training SHALL NOT change desktop configuration or overwrite deployed weights automatically.

#### Scenario: Training finishes
- **WHEN** a training run finishes and produces best.pt
- **THEN** the output names the actual best.pt file and shows the environment assignment needed to load it

#### Scenario: Trainer produces no best weights
- **WHEN** training returns without producing best.pt
- **THEN** the command exits nonzero with an actionable error instead of reporting success

### Requirement: Reject unusable inputs
The CLI SHALL exit nonzero with an actionable message for missing dataset YAML, nonpositive numeric training settings, malformed dataset configuration, or training failure. Invalid CLI arguments and missing dataset files SHALL be rejected before initializing the model.

#### Scenario: Dataset is missing
- **WHEN** the supplied dataset YAML does not exist
- **THEN** the error names the missing file and no training begins

#### Scenario: Invalid epoch count
- **WHEN** epochs is zero or negative
- **THEN** the command rejects the value before loading weights

#### Scenario: Dataset configuration is invalid
- **WHEN** the dataset YAML cannot be parsed or refers to unavailable training images
- **THEN** the command exits nonzero and exposes the dataset error

### Requirement: Preserve separate training outputs
The CLI SHALL preserve prior run outputs by using a separate run directory when the requested run name already exists.

#### Scenario: Repeat a run name
- **WHEN** training is started with an existing run name
- **THEN** its new weights are saved separately and the CLI reports the new location
