# Llama Prompt Guard 2 Model Setup

⚠️ **REQUIRED BEFORE INSTALLATION** - The Llama Prompt Guard 2 model must be downloaded before running `./install.sh`

## Quick Start

### Option 1: External Directory (Recommended)

Download to parent directory (keeps repository clean):

```bash
./scripts/download-llama-model.sh
```

Model location: `../vigil-llm-models/Llama-Prompt-Guard-2-86M/`

### Option 2: Repository Directory

Download to repository (gitignored):

```bash
cd Llama-Prompt-Guard-2-86M
./download-here.sh
```

Model location: `./Llama-Prompt-Guard-2-86M/`

## Why Download Separately?

Meta's **Llama 4 Community License** prohibits including model files in this repository. You must:

1. Create a free Hugging Face account: https://huggingface.co/join
2. Accept the license: https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M
3. Download using one of the scripts above

## Verification

The installation script will automatically detect the model in either location:

```bash
./install.sh
```

If the model is not found, you'll see detailed instructions on how to download it.

## Model Details

- **Model**: Meta Llama Prompt Guard 2 (86M parameters)
- **Size**: ~1.1 GB
- **Purpose**: Advanced prompt injection detection
- **License**: Llama 4 Community License

## Troubleshooting

### Model Not Found During Installation

If `./install.sh` says "Model NOT FOUND":

1. Check if model exists:
   ```bash
   ls ../vigil-llm-models/Llama-Prompt-Guard-2-86M/config.json
   # OR
   ls ./Llama-Prompt-Guard-2-86M/config.json
   ```

2. If missing, run one of the download scripts above

3. If exists but not detected, check for `config.json` file inside the model directory

### Download Fails with "401 Unauthorized"

You haven't accepted the license:
- Visit: https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M
- Click "Agree and access repository"
- Run the download script again

### "huggingface-cli: command not found"

Install Hugging Face CLI:
```bash
pip install huggingface-hub
huggingface-cli login
```

## For More Information

- Full download instructions: [Llama-Prompt-Guard-2-86M/DOWNLOAD_INSTRUCTIONS.md](Llama-Prompt-Guard-2-86M/DOWNLOAD_INSTRUCTIONS.md)
- Model documentation: [Llama-Prompt-Guard-2-86M/README_MODEL.md](Llama-Prompt-Guard-2-86M/README_MODEL.md) (from Hugging Face)
- Installation guide: [docs/INSTALLATION.md](docs/INSTALLATION.md)
- Prompt Guard API: [prompt-guard-api/README.md](prompt-guard-api/README.md)
