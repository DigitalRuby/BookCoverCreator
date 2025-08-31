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

        private static string paramFileName;

        /// <summary>
        /// Main
        /// </summary>
        /// <param name="args"></param>
        public static void Main(string[] args)
        {
            if (args.Length != 1)
            {
                Console.WriteLine("Please pass one argument, the file name containing the metadata to process.");
                Console.WriteLine("This file must contain the following parameters, one per line:");
                Console.WriteLine("OutputFolder=value (the output folder).");
                Console.WriteLine("Width (i.e. 4039)");
                Console.WriteLine("Height (i.e. 2775)");
                Console.WriteLine("SpineWidth (i.e. 366)");
                Console.WriteLine();
                Console.WriteLine("The following parameters are optional:");
                Console.WriteLine("BackCoverFile=value (the name of the back cover file in the input folder, default is BackCover.png).");
                Console.WriteLine("SpineFile=value (the name of the spine file in the input folder, default is Spine.png).");
                Console.WriteLine("FrontCoverFile=value (the name of the front cover file in the input folder, default is FrontCover.png).");
                Console.WriteLine("SpineAlphaMultiplier=value (i.e. 2.0, higher values reduce fade effect).");
                Console.WriteLine("SpineAlphaPower (i.e. 1.0, lower values reduce fade effect, set to 0 for no fade).");
                Console.WriteLine();
                Console.WriteLine("Enter parameters file name to process:");
                paramFileName = Console.ReadLine();
                if (string.IsNullOrWhiteSpace(paramFileName))
                {
                    Console.WriteLine("No parameters file name entered. Exiting.");
                    return;
                }
            }
            else
            {
                paramFileName = args[0];
            }
            paramFileName = paramFileName.Trim('"');
            var dict = ParseKeyValueFile(paramFileName);
            AssignVariables(dict);

            string backCoverFile = backCoverFileName;
            string spineFile = spineFileName;
            string frontCoverFile = frontCoverFileName;
            string backCoverFileResized = Path.Combine(outputFolder, "04-BackCover.png");
            string backCoverFileMirrored = Path.Combine(outputFolder, "02-BackCoverMirrored.png");
            string spineFileFaded = Path.Combine(outputFolder, "01-SpineBlend.png");
            string frontCoverResized = Path.Combine(outputFolder, "05-FrontCover.png");
            string frontCoverFileMirrored = Path.Combine(outputFolder, "03-FrontCoverMirrored.png");
            Directory.CreateDirectory(outputFolder);
            ProcessCover(backCoverFile, backCoverFileResized, backCoverFileMirrored, true);
            ProcessCover(frontCoverFile, frontCoverResized, frontCoverFileMirrored, false);
            ProcessSpine(spineFile, spineFileFaded);
            Console.WriteLine("Image processing complete. You can now take the files from the output folder at {0} and put them into your template image as individual layers.");
            Console.WriteLine("Top down order is: ");
            Console.WriteLine("01-SpineBlend.png");
            Console.WriteLine("02-BackCoverMirrored.png");
            Console.WriteLine("03-FrontCoverMirrored.png");
            Console.WriteLine("04-BackCover.png");
            Console.WriteLine("05-FrontCover.png");
        }

        private static Dictionary<string, string> ParseKeyValueFile(string fileName)
        {
            // Dictionary to store the key-value pairs
            Dictionary<string, string> keyValuePairs = new(StringComparer.OrdinalIgnoreCase);

            // Read all lines from the file
            string[] lines = File.ReadAllLines(fileName.Trim('"'));

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
            static string RootToParamFile(string path)
            {
                path = path.Trim('"');
                if (!Path.IsPathRooted(path))
                {
                      path = Path.Combine(Path.GetDirectoryName(paramFileName), path);
                }
                return path;
            }

            foreach (var kv in dict)
            {
                switch (kv.Key.ToLowerInvariant())
                {
                    case "outputfolder":
                        outputFolder = RootToParamFile(kv.Value);
                        break;
                    case "backcoverfile":
                        backCoverFileName = RootToParamFile(kv.Value);
                        break;
                    case "spinefile":
                        spineFileName = RootToParamFile(kv.Value);
                        break;
                    case "frontcoverfile":
                        frontCoverFileName = RootToParamFile(kv.Value);
                        break;
                    case "spinealphamultiplier":
                        spineAlphaMultiplier = float.Parse(kv.Value);
                        break;
                    case "spinealphapower":
                        spineAlphaPower = float.Parse(kv.Value);
                        break;
                    case "width":
                        finalWidth = int.Parse(kv.Value);
                        break;
                    case "height":
                        finalHeight = int.Parse(kv.Value);
                        break;
                    case "spinewidth":
                        spineWidth = int.Parse(kv.Value);
                        break;
                }
            }

            aspectRatioSpine = (double)spineWidth / finalHeight;
            aspectRatioCover = (double)((finalWidth - spineWidth) / 2.0) / finalHeight;
            frontWidth = (finalWidth - spineWidth) / 2;
            backWidth = finalWidth - frontWidth - spineWidth;
            finalRect = new(0, 0, finalWidth, finalHeight);
            spineRect = new(backWidth, 0, spineWidth, finalHeight);
            backCoverRect = new(0, 0, backWidth, finalHeight);
            backCoverMirrorRectDest = new(spineRect.X, 0, spineRect.Width / 2, spineRect.Height);
            backCoverMirrorRectSource = new(0, 0, spineRect.Width / 2, spineRect.Height);
            frontCoverRect = new(backWidth + spineWidth, 0, frontWidth, finalHeight);
            frontCoverMirrorRectDest = new(spineRect.Left + (spineRect.Width / 2), 0, spineRect.Width / 2, spineRect.Height);
            frontCoverMirrorSource = new(frontCoverRect.Width - (spineRect.Width / 2), 0, (spineRect.Width / 2), spineRect.Height);
        }

        private static void ProcessCover(string inputFilePath, string outputFileResized, string outputFileMirrored, bool isBackCover)
        {
            using var coverImage = Image.Load<Rgba32>(inputFilePath);
            using var croppedImage = Crop(coverImage, aspectRatioCover);

            // Create the final image
            var finalImage = new Image<Rgba32>(finalRect.Width, finalRect.Height, Color.Transparent);

            // Calculate positions to position the resized image
            Rectangle coverRectDest = isBackCover ? backCoverRect : frontCoverRect;
            Rectangle mirrorRectDest = isBackCover ? backCoverMirrorRectDest : frontCoverMirrorRectDest;
            Rectangle mirrorRectSource = isBackCover ? backCoverMirrorRectSource : frontCoverMirrorSource;

            // Draw the resized image onto the final image
            using var croppedImageResized = croppedImage.Clone(ctx => ctx.Resize(new Size(coverRectDest.Width, coverRectDest.Height)));
            finalImage.Mutate(ctx => ctx.DrawImage(croppedImageResized, new Point(coverRectDest.X, coverRectDest.Y), 1.0f));

            // Save the final image
            finalImage.Save(outputFileResized);

            // Re-use final image for mirroring
            finalImage.Dispose();
            finalImage = new Image<Rgba32>(finalRect.Width, finalRect.Height, Color.Transparent);

            // If we have space, extend the image instead of mirroring
            float widthRatio = (float)croppedImageResized.Width / (float)croppedImage.Width;

            // Convert from cropt resize measures to original image measures
            int neededGap = (int)((float)mirrorRectSource.Width / widthRatio);
            int actualGap = (coverImage.Width - croppedImage.Width) / 2;
            if (neededGap <= actualGap)
            {
                // Extract the edge of the cover, using the right side for back and left side for front,
                //  then draw this onto the final image at the mirror position
                // Create a crop rect that takes into account the original cover size and the final cover size
                int croppedX = ((coverImage.Width - croppedImage.Width) / 2);
                int x = isBackCover ? croppedImage.Width + croppedX : croppedX - neededGap;
                int y = (croppedImage.Height - coverImage.Height) / 2;
                int width = neededGap;
                int height = croppedImage.Height;
                var cropRect = new Rectangle(x, y, width, height);
                using var edgeImage = coverImage.Clone(ctx =>
                {
                    ctx.Crop(cropRect);
                    ctx.Resize(mirrorRectDest.Width, mirrorRectDest.Height);
                });
                finalImage.Mutate(ctx => ctx.DrawImage(edgeImage, new Point(mirrorRectDest.X, mirrorRectDest.Y), 1.0f));
            }
            else
            {
                // Create the mirrored image
                using var mirroredImage = new Image<Rgba32>(coverRectDest.Width, coverRectDest.Height);

                // Draw image and mirror it
                mirroredImage.Mutate(ctx => ctx.DrawImage(croppedImageResized, new Point(0, 0), 1.0f));
                mirroredImage.Mutate(ctx => ctx.Flip(FlipMode.Horizontal));

                // Extract the mirror rect source from the mirrored image
                using var mirroredImageSource = mirroredImage.Clone(ctx => ctx.Crop(mirrorRectSource));

                // Draw the mirrored image onto the final image
                finalImage.Mutate(ctx => ctx.DrawImage(mirroredImageSource, new Point(mirrorRectDest.X, mirrorRectDest.Y), 1.0f));
            }

            // Save the mirrored image
            finalImage.Save(outputFileMirrored);
            finalImage.Dispose();
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

        private static Image<Rgba32> Crop(Image<Rgba32> image, double aspectRatio)
        {
            // Calculate the desired dimensions of the cropped image
            var imageAspectRatio = (double)image.Width / (double)image.Height;
            var cropWidth = aspectRatio > imageAspectRatio ? image.Width : (int)(image.Height * aspectRatio);
            var cropHeight = aspectRatio < imageAspectRatio ? image.Height : (int)(image.Width / aspectRatio);

            // Calculate the crop rectangle, centered in the image
            var x = (image.Width - cropWidth) / 2;
            var y = (image.Height - cropHeight) / 2;

            // Crop the image
            var croppedImage = image.Clone();
            croppedImage.Mutate(ctx => ctx.Crop(new Rectangle(x, y, cropWidth, cropHeight)));
            return croppedImage;
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