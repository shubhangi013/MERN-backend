import express from 'express';
import multer from 'multer';
import {UploadApiResponse, v2 as cloudinary} from 'cloudinary';
import File from '../models/File';
import https from 'https';
import nodemailer from 'nodemailer';
import createEmailTemplate from '../utils/createEmailTemplate';


const router = express.Router()

const storage= multer.diskStorage({})

let upload= multer({
  storage,
});

router.post("/upload",upload.single("myFile"),async (req,res)=>{
   try {
    if(!req.file)
    return res.status(400).json({message:"hey! we need the file"})

    console.log(req.file);

    let uploadedFile: UploadApiResponse;
    try {
      uploadedFile= await cloudinary.uploader.upload(req.file.path,{
        folder: "MERN",
        resource_type: "auto"
      })
    } catch (error:any) {
      console.log(error.message);
      return res.status(400).json({message:"Cloudinary Error"})
    }
    const {originalname}= req.file;
    const {secure_url,bytes,format}= uploadedFile;

    const file= await File.create({
      filename: originalname,
      sizeInBytes:bytes,
      secure_url,
      format
    });
    res.status(200).json({
      id:file._id,
      downloadPageLink:`${process.env.API_BASE_ENDPOINT_CLIENT}download/${file._id}`
    });

  } catch (error) {
    console.log("error occured");
    res.status(500).json({message:"server error"})
  }


})

router.get("/:id",async (req,res)=>{
  try {
    const id= req.params.id;
    const file= await File.findById(id)
    if(!file){
      return res.status(404).json({message:"file does not exist"})
    }
    const {filename, format, sizeInBytes}= file
    return res.status(200).json({
        name:filename,
        sizeInBytes,
        format,
        id,
    })
  } catch (error) {
    return res.status(500).json({message:"server error"})
    
  }
})

router.get("/:id/download",async (req,res)=>{
  try {
    const id= req.params.id;
    const file= await File.findById(id)
    if(!file){
      return res.status(404).json({message:"file does not exist"})
    }
    https.get(file.secure_url,(fileStream)=>
    fileStream.pipe(res))

  } catch (error) {
    return res.status(500).json({message:"server error"})
    
  }
})

router.post("/email", async (req,res)=>{
  const {id,emailFrom,emailTo}= req.body

  const file= await File.findById(id)
    if(!file){
      return res.status(404).json({message:"file does not exist"})
    }
  let transporter = nodemailer.createTransport({
    //@ts-ignore
    host: process.env.SENDINBLUE_SMTP_HOST!,
    port: process.env.SENDINBLUE_SMTP_PORT,
    secure: false, 
    auth: {
      user: process.env.SENDINBLUE_SMTP_USER,
      pass: process.env.SENDINBLUE_SMTP_PASSWORD
    },
  });

  const {filename,sizeInBytes} = file;
  const fileSize=`${(Number(sizeInBytes)/(1024*1024)).toFixed(2)} MB`
  const downloadPageLink=`${process.env.API_BASE_ENDPOINT_CLIENT}download/${file._id}`
  

  const mailOptions={
    from: emailFrom,
    to: emailTo, // list of receivers
    subject: "File shared with you!", // Subject line
    text: `:${emailFrom} sent you a file!`, // plain text body
    html: createEmailTemplate(emailFrom, downloadPageLink,filename,fileSize), // html body
  };

  transporter.sendMail(mailOptions, async(error, info)=>{
if(error){
  console.log(error);
  return res.status(500).json({
    message:"server error",
  })
}
file.sender = emailFrom
file.receiver = emailTo
await file.save();
return res.status(200).json({
  message:"email sent",
})
  })
})

export default router;