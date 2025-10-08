# Llama Prompt Guard 2 - Download Instructions

⚠️ **MODEL NOT INCLUDED** - This directory is a placeholder for Meta's Llama Prompt Guard 2 model, which must be downloaded separately due to license restrictions.

> **Note**: This file was renamed from `README.md` to `DOWNLOAD_INSTRUCTIONS.md` to avoid conflicts with the model's own `README_MODEL.md` file from Hugging Face.

## Why This Directory Exists

The Vigil Guard project uses **Meta's Llama Prompt Guard 2** (86M parameters) for advanced prompt injection detection. However, due to the **Llama 4 Community License** terms, we cannot include the model files in this repository.

## Quick Start - Download the Model

### Option 1: Automated Download (Recommended)

Run the provided download script from the project root:

```bash
cd ..  # Go to Vigil Guard root directory
./scripts/download-llama-model.sh
```

The script will:
- Check for required dependencies
- Verify Hugging Face authentication
- Download the model to this directory
- Validate the download

### Option 2: Download to This Directory

If you prefer to download directly to this location:

```bash
# Install Hugging Face CLI (if not already installed)
pip install huggingface-hub

# Login to Hugging Face
huggingface-cli login

# Accept the license at: https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M

# Download model to THIS directory
huggingface-cli download meta-llama/Llama-Prompt-Guard-2-86M \
  --local-dir /Users/tomaszbartel/Documents/Projects/Vigil-Guard/Llama-Prompt-Guard-2-86M
```

### Option 3: Use External Directory (Recommended)

The project is configured to look for the model outside the repository:

```bash
cd ..  # Go to parent directory
mkdir -p vigil-llm-models
cd vigil-llm-models

huggingface-cli download meta-llama/Llama-Prompt-Guard-2-86M \
  --local-dir Llama-Prompt-Guard-2-86M
```

The installation script will detect the model at `../vigil-llm-models/Llama-Prompt-Guard-2-86M/` automatically.

## License Requirements

⚠️ **Important**: Before downloading, you MUST:

1. **Create a Hugging Face account** (free): https://huggingface.co/join
2. **Accept Meta's license**: https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M
3. **Authenticate** with `huggingface-cli login`

## Expected Directory Structure

After downloading, this directory should contain:

```
Llama-Prompt-Guard-2-86M/
├── DOWNLOAD_INSTRUCTIONS.md   # This file (download guide)
├── README_MODEL.md            # Model documentation from Hugging Face
├── LICENSE                    # Llama 4 Community License
├── USE_POLICY.md             # Usage policy from Meta
├── config.json               # Model configuration
├── model.safetensors         # Model weights (~1.06 GB)
├── tokenizer.json            # Tokenizer data (~15.6 MB)
├── tokenizer_config.json     # Tokenizer configuration
├── special_tokens_map.json   # Special tokens mapping
├── checklist.chk             # Download verification
├── download-here.sh          # Local download script (from repo)
└── .gitkeep                  # Git tracking (from repo)
```

**Total size**: ~1.1 GB (model files only)

## Verification

To verify the model downloaded correctly:

```bash
# Check if all required files exist
ls -lh

# Should show:
# - config.json
# - model.safetensors
# - tokenizer files
```

Or run the verification from the project root:

```bash
cd ..
./scripts/verify-model.sh
```

## Troubleshooting

### "401 Client Error: Unauthorized"
- You haven't accepted the license agreement
- Visit: https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M
- Click "Agree and access repository"

### "huggingface-cli: command not found"
```bash
pip install huggingface-hub
```

### "Repository not found"
- Make sure you're logged in: `huggingface-cli login`
- Verify you accepted the license

### Slow download
- Model is 1.1 GB - download time depends on your internet speed
- Use `--resume` flag if download is interrupted

## Alternative: Docker Volume Mount

If you prefer to keep the model outside the repository entirely:

1. Download to any location:
   ```bash
   mkdir -p ~/llm-models/Llama-Prompt-Guard-2-86M
   huggingface-cli download meta-llama/Llama-Prompt-Guard-2-86M \
     --local-dir ~/llm-models/Llama-Prompt-Guard-2-86M
   ```

2. Update `docker-compose.yml` volume mount:
   ```yaml
   volumes:
     - ~/llm-models/Llama-Prompt-Guard-2-86M:/models/Llama-Prompt-Guard-2-86M:ro
   ```

## License Information

**Model License**: Llama 4 Community License
**Copyright**: © Meta Platforms, Inc. All Rights Reserved
**Full License**: https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M

### Key License Terms

- ✅ Free for research and commercial use
- ✅ Can modify and distribute derivatives
- ❌ Cannot redistribute original model files directly
- ⚠️ Must display "Built with Llama" attribution
- ⚠️ Monthly active users > 700M require special license

## Support

For issues with:
- **Model download**: Check Hugging Face status at https://status.huggingface.co/
- **Vigil Guard installation**: See main project [README.md](../README.md)
- **License questions**: Contact Meta directly

---

**Built with Llama** - This project uses Meta's Llama Prompt Guard 2 model for AI-powered security.
