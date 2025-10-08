# Meta Llama Prompt Guard 2 License Notice

## Model Information

This service uses **Meta Llama Prompt Guard 2 (86M parameters)** for prompt injection detection.

**Model Repository**: https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M

## License

The Llama Prompt Guard 2 model is licensed under the **Llama 4 Community License**.

**Copyright © Meta Platforms, Inc. All Rights Reserved.**

## License Requirements

By using this model, you agree to:

1. ✅ **Accept the License Agreement**
   - You must read and accept the license at: https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M
   - Click "Agree and access repository" on the Hugging Face page

2. ✅ **Download the Model Separately**
   - The model files are **NOT included** in this repository
   - You must download them yourself using the provided scripts
   - Model files **cannot be redistributed** in this repository

3. ✅ **Display Attribution**
   - You **must** display "Built with Llama" in your user interface
   - Attribution is visible in the Vigil Guard Web UI footer

4. ✅ **Comply with Use Restrictions**
   - Review the full license terms before use
   - Ensure your use case complies with Meta's acceptable use policy

## Full License Text

The complete Llama 4 Community License is available at:

**https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M**

## Attribution

**Built with Llama**

This service is powered by Meta's Llama Prompt Guard 2 model.

Llama 4 is licensed under the Llama 4 Community License, Copyright © Meta Platforms, Inc. All Rights Reserved.

## Model Details

- **Model Name**: Llama-Prompt-Guard-2-86M
- **Parameters**: 86 million
- **Task**: Binary text classification (SAFE/ATTACK)
- **Architecture**: Transformer-based
- **Size**: ~1.1 GB
- **License**: Llama 4 Community License

## Downloading the Model

### Prerequisites

1. Create a Hugging Face account: https://huggingface.co/join
2. Accept the license at: https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M
3. Install Hugging Face CLI: `pip install huggingface-hub`
4. Login: `huggingface-cli login`

### Automated Download

From the Vigil Guard root directory:

```bash
./scripts/download-llama-model.sh
```

### Manual Download

```bash
cd ..
mkdir -p vigil-llm-models
huggingface-cli download meta-llama/Llama-Prompt-Guard-2-86M \
  --local-dir vigil-llm-models/Llama-Prompt-Guard-2-86M
```

## Verification

After download, verify the model files:

```bash
ls -la ../vigil-llm-models/Llama-Prompt-Guard-2-86M/
```

Required files:
- `config.json` - Model configuration
- `model.safetensors` - Model weights (~350 MB)
- `tokenizer.json` - Tokenizer vocabulary
- `tokenizer_config.json` - Tokenizer configuration
- `special_tokens_map.json` - Special tokens

## Disclaimer

This software uses the Llama Prompt Guard 2 model "as is" without warranty of any kind. Users are responsible for complying with Meta's license terms and acceptable use policies.

For questions about the license, contact Meta Platforms, Inc. or refer to the official license documentation on Hugging Face.

---

**Last Updated**: October 2025

**License Source**: https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M
