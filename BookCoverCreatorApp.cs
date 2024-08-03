using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;
using SixLabors.ImageSharp.Drawing.Processing;

#nullable disable

namespace BookCoverCreator
{
    /// <summary>
    /// Program
    /// </summary>
    public static class Program
    {
        private static double aspectRatioCover = 2.0 / 3.0; // 6x9 paperback
        private static double aspectRatioSpine = 0.13189; // 1.0 / 7.582 6x9 paperback spine
        private static float spineAlphaMultiplier = 2.0f; // increase to reduce fade effect on the spine
        private static float spineAlphaPower = 1.0f; // reduce to decrease fade effect on the spine
        private static int finalWidth = 4039;
        private static int finalHeight = 2775;
        private static int spineWidth = 366;
        private static string inputFolder;
        private static string outputFolder;
        private static string backCoverFileName = "BackCover.png";
        private static string spineFileName = "Spine.png";
        private static string frontCoverFileName = "FrontCover.png";

        private static int frontWidth;
        private static int backWidth;
        private static Rectangle finalRect;
        private static Rectangle spineRect;
        private static Rectangle backCoverRect;
        private static Rectangle backCoverMirrorRectDest;
        private static Rectangle backCoverMirrorRectSource;
        private static Rectangle frontCoverRect;
        private static Rectangle frontCoverMirrorRectDest;
        private static Rectangle frontCoverMirrorSource;

        /// <summary>
        /// Main
        /// </summary>
        /// <param name="args"></param>
        public static void Main(string[] args)
        {
            if (args.Length != 1)
            {
                Console.WriteLine("Please pass one argument, the file name containing the metadata to process.");
                Console.WriteLine("This file must contain the following parameters:");
                Console.WriteLine("InputFolder=value (the input folder containing the BackCover, Spine, and FrontCover files--default extension is .png).");
                Console.WriteLine("OutputFolder=value (the output folder).");
                Console.WriteLine();
                Console.WriteLine("The following parameters are optional:");
                Console.WriteLine("BackCoverFile=value (the name of the back cover file in the input folder, default is BackCover.png).");
                Console.WriteLine("SpineFile=value (the name of the spine file in the input folder, default is Spine.png).");
                Console.WriteLine("FrontCoverFile=value (the name of the front cover file in the input folder, default is FrontCover.png).");
                Console.WriteLine("CoverAspectRatio=value (i.e. 0.6667 for 6x9 paperback).");
                Console.WriteLine("SpineAspectRatio=value (i.e. 0.13189 for 6x9 paperback).");
                Console.WriteLine("SpineAlphaMultiplier=value (i.e. 2.0, higher values reduce fade effect).");
                Console.WriteLine("SpineAlphaPower (i.e. 1.0, lower values reduce fade effect, set to 0 for no fade).");
                Console.WriteLine("TemplateWidth (i.e. 4039)");
                Console.WriteLine("TemplateHeight (i.e. 2775)");
                Console.WriteLine("TemplateSpineWidth (i.e. 366)");
                return;
            }
            var dict = ParseKeyValueFile(args[0]);
            AssignVariables(dict);

            string backCoverFile = Path.Combine(inputFolder, backCoverFileName);
            string spineFile = Path.Combine(inputFolder, spineFileName);
            string frontCoverFile = Path.Combine(inputFolder, frontCoverFileName);
            string backCoverFileResized = Path.Combine(outputFolder, "BackCover.png");
            string backCoverFileMirrored = Path.Combine(outputFolder, "BackCoverMirrored.png");
            string spineFileFaded = Path.Combine(outputFolder, "SpineBlend.png");
            string frontCoverResized = Path.Combine(outputFolder, "FrontCover.png");
            string frontCoverFileMirrored = Path.Combine(outputFolder, "FrontCoverMirrored.png");
            Directory.CreateDirectory(outputFolder);
            ProcessSpine(spineFile, spineFileFaded);
            ProcessCover(backCoverFile, backCoverFileResized, backCoverFileMirrored, true);
            ProcessCover(frontCoverFile, frontCoverResized, frontCoverFileMirrored, false);

            Console.WriteLine("Image processing complete. You can now take the files from the output folder at {0} and put them into your template image as individual layers.");
            Console.WriteLine("Top down order is: ");
            Console.WriteLine("1. SpineBlend.png");
            Console.WriteLine("2. BackCoverMirrored.png");
            Console.WriteLine("3. FrontCoverMirrored.png");
            Console.WriteLine("4. BackCover.png");
            Console.WriteLine("5. FrontCover.png");
        }

        private static Dictionary<string, string> ParseKeyValueFile(string fileName)
        {
            // Dictionary to store the key-value pairs
            Dictionary<string, string> keyValuePairs = new(StringComparer.OrdinalIgnoreCase);

            // Read all lines from the file
            string[] lines = File.ReadAllLines(fileName);

            // Iterate through each line
            foreach (string line in lines)
            {
                // Skip empty lines or lines that do not contain '='
                if (string.IsNullOrWhiteSpace(line) || !line.Contains('='))
                {
                    continue;
                }

                // Split the line into key and value
                string[] parts = line.Split('=', 2); // Limit the split to 2 parts
                if (parts.Length == 2)
                {
                    string key = parts[0].Trim();
                    string value = parts[1].Trim();

                    // Add the key-value pair to the dictionary
                    keyValuePairs[key] = value;
                }
            }

            return keyValuePairs;
        }

        private static void AssignVariables(Dictionary<string, string> dict)
        {
            foreach (var kv in dict)
            {
                switch (kv.Key.ToLowerInvariant())
                {
                    case "inputfolder":
                        inputFolder = kv.Value;
                        break;
                    case "outputfolder":
                        outputFolder = kv.Value;
                        break;
                    case "backcoverfile":
                        backCoverFileName = kv.Value;
                        break;
                    case "spinefile":
                        spineFileName = kv.Value;
                        break;
                    case "frontcoverfile":
                        frontCoverFileName = kv.Value;
                        break;
                    case "coveraspectratio":
                        aspectRatioCover = double.Parse(kv.Value);
                        break;
                    case "spineaspectratio":
                        aspectRatioSpine = double.Parse(kv.Value);
                        break;
                    case "spinealphamultiplier":
                        spineAlphaMultiplier = float.Parse(kv.Value);
                        break;
                    case "spinealphapower":
                        spineAlphaPower = float.Parse(kv.Value);
                        break;
                    case "templatewidth":
                        finalWidth = int.Parse(kv.Value);
                        break;
                    case "templateheight":
                        finalHeight = int.Parse(kv.Value);
                        break;
                    case "templatespinewidth":
                        spineWidth = int.Parse(kv.Value);
                        break;
                }
            }

            frontWidth = (finalWidth - spineWidth) / 2;
            backWidth = finalWidth - frontWidth - spineWidth;
            finalRect = new(0, 0, finalWidth, finalHeight);
            spineRect = new(backWidth, 0, spineWidth, finalHeight);
            backCoverRect = new(0, 0, backWidth, finalHeight);
            backCoverMirrorRectDest = new(spineRect.X, 0, spineRect.Width / 2, spineRect.Height);
            backCoverMirrorRectSource = new(0, 0, spineRect.Width / 2, spineRect.Height);
            frontCoverRect = new(backWidth + spineWidth, 0, frontWidth, finalHeight);
            frontCoverMirrorRectDest = new(spineRect.Left + (spineRect.Width / 2), 0, spineRect.Width / 2, 0);
            frontCoverMirrorSource = new(frontCoverRect.Width - (spineRect.Width / 2), 0, (spineRect.Width / 2), spineRect.Height);
        }

        private static void ProcessCover(string inputFilePath, string outputFileResized, string outputFileMirrored, bool isBackCover)
        {
            using Image<Rgba32> coverImage = Image.Load<Rgba32>(inputFilePath);
            Crop(coverImage, aspectRatioCover);

            // Create the final image
            using Image<Rgba32> finalImage = new(finalRect.Width, finalRect.Height, Color.Transparent);

            // Calculate positions to position the resized image
            Rectangle coverRectDest = isBackCover ? backCoverRect : frontCoverRect;
            Rectangle mirrorRectDest = isBackCover ? backCoverMirrorRectDest : frontCoverMirrorRectDest;
            Rectangle mirrorRectSource = isBackCover ? backCoverMirrorRectSource : frontCoverMirrorSource;


            // Draw the resized image onto the final image
            coverImage.Mutate(ctx => ctx.Resize(new Size(coverRectDest.Width, coverRectDest.Height)));
            finalImage.Mutate(ctx => ctx.DrawImage(coverImage, new Point(coverRectDest.X, coverRectDest.Y), 1.0f));

            // Save the final image
            finalImage.Save(outputFileResized);

            // Create the mirrored image
            using Image<Rgba32> mirroredImage = new(coverRectDest.Width, coverRectDest.Height);
            mirroredImage.Mutate(ctx => ctx.DrawImage(coverImage, new Point(0, 0), 1.0f));
            mirroredImage.Mutate(ctx => ctx.Flip(FlipMode.Horizontal));

            // extract the mirror rect source from the mirrored image
            using Image<Rgba32> mirroredImageSource = mirroredImage.Clone(ctx => ctx.Crop(mirrorRectSource));

            // Draw the mirrored image onto the final image
            finalImage.Mutate(ctx => ctx.Clear(Color.Transparent));
            finalImage.Mutate(ctx => ctx.DrawImage(mirroredImageSource, new Point(mirrorRectDest.X, mirrorRectDest.Y), 1.0f));

            // Save the mirrored image
            finalImage.Save(outputFileMirrored);
        }
            
        private static void ProcessSpine(string inputFilePath, string outputFilePath)
        {
            using Image<Rgba32> image = Image.Load<Rgba32>(inputFilePath);
            Crop(image, aspectRatioSpine);

            // Remove black rows from top and bottom
            image.Mutate(ctx => RemoveBlackRows(image));

            // Resize image to spine dimensions
            image.Mutate(ctx => ctx.Resize(new Size(spineRect.Width, spineRect.Height)));

            // Apply gradient fade from each edge to the center
            ApplyAlphaGradient(image);

            // Create the final image
            using Image<Rgba32> finalImage = new(finalRect.Width, finalRect.Height, Color.Transparent);

            // Draw the resized and faded image onto the final image
            finalImage.Mutate(ctx => ctx.DrawImage(image, new Point(spineRect.X, spineRect.Y), 1.0f));

            // Save the final image as a PNG
            finalImage.Save(outputFilePath);
        }

        private static void Crop(Image<Rgba32> image, double aspectRatio)
        {
            // Calculate the desired dimensions of the cropped image
            var imageAspectRatio = (double)image.Width / (double)image.Height;
            var cropWidth = aspectRatio > imageAspectRatio ? image.Width : (int)(image.Height * aspectRatio);
            var cropHeight = aspectRatio < imageAspectRatio ? image.Height : (int)(image.Width / aspectRatio);

            // Calculate the crop rectangle, centered in the image
            var x = (image.Width - cropWidth) / 2;
            var y = (image.Height - cropHeight) / 2;

            // Crop the image
            image.Mutate(ctx => ctx.Crop(new Rectangle(x, y, cropWidth, cropHeight)));
        }

        private static void RemoveBlackRows(Image<Rgba32> image)
        {
            if (image.Width < 16 && image.Height < 16)
            {
                return;
            }

            const byte threshold = 10;

            // Remove black rows from the top
            int topNonBlackRow = 0;
            for (int y = 0; y < image.Height; y++)
            {
                bool isBlackRow = true;
                for (int x = 0; x < image.Width; x++)
                {
                    if (image[x, y].R > threshold || image[x, y].G > threshold || image[x, y].B > threshold)
                    {
                        isBlackRow = false;
                        break;
                    }
                }

                if (!isBlackRow)
                {
                    topNonBlackRow = y;
                    break;
                }
            }

            // Remove black rows from the bottom
            int bottomNonBlackRow = image.Height - 1;
            for (int y = image.Height - 1; y >= 0; y--)
            {
                bool isBlackRow = true;
                for (int x = 0; x < image.Width; x++)
                {
                    if (image[x, y].R > threshold || image[x, y].G > threshold || image[x, y].B > threshold)
                    {
                        isBlackRow = false;
                        break;
                    }
                }

                if (!isBlackRow)
                {
                    bottomNonBlackRow = y;
                    break;
                }
            }

            // Crop the image to remove black rows from top and bottom
            int newHeight = bottomNonBlackRow - topNonBlackRow + 1;
            if (newHeight > 0)
            {
                image.Mutate(ctx => ctx.Crop(new Rectangle(0, topNonBlackRow, image.Width, newHeight)));
            }
        }

        private static void ApplyAlphaGradient(Image<Rgba32> image)
        {
            int width = image.Width;
            int halfWidth = width / 2;

            static float GetAlphaFactor(int x, int width, int halfWidth)
            {
                float distanceFromEdge = Math.Min(x, width - x - 1);
                return (float)Math.Clamp(Math.Pow((distanceFromEdge / halfWidth) * spineAlphaMultiplier, spineAlphaPower), 0.0, 1.0);
            }

            image.Mutate(ctx =>
            {
                for (int y = 0; y < image.Height; y++)
                {
                    for (int x = 0; x < width; x++)
                    {
                        float alphaFactor = GetAlphaFactor(x, width, halfWidth);
                        Rgba32 pixel = image[x, y];
                        pixel.A = (byte)(pixel.A * alphaFactor);
                        image[x, y] = pixel;
                    }
                }
            });
        }
    }
}

#nullable restore